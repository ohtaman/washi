use std::cell::Cell;
use std::collections::{BTreeMap, HashMap};
use std::ops::ControlFlow;
use std::rc::Rc;

use js_sys::Function;
use pumpkin_conflict_resolvers::resolvers::ResolutionResolver;
use pumpkin_constraints::{
    clause, conjunction, equals, greater_than_or_equals, less_than_or_equals,
};
use pumpkin_core::branching::branchers::warm_start::WarmStart;
use pumpkin_core::branching::{Brancher, BrancherEvent, SelectionContext};
use pumpkin_core::optimisation::linear_sat_unsat::LinearSatUnsat;
use pumpkin_core::optimisation::OptimisationDirection;
use pumpkin_core::options::SolverOptions;
use pumpkin_core::predicates::Predicate;
use pumpkin_core::results::{
    OptimisationResult, ProblemSolution, SatisfactionResult, SatisfactionResultUnderAssumptions,
    SolutionReference,
};
use pumpkin_core::statistics::StatisticLogger;
use pumpkin_core::termination::{TerminationCondition, TimeBudget};
use pumpkin_core::variables::{AffineView, DomainId, Literal, TransformableVariable};
use pumpkin_core::{DefaultBrancher, Duration, Solver};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Keep values within [-(2^30 - 1), 2^30 - 1] so scaled views, constraint negations (-rhs - 1),
/// and propagator slack arithmetic never overflow signed 32-bit integers.
const SAFE_I32_LIMIT: i64 = 1_073_741_823;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VarSpec {
    pub name: String,
    pub lb: i64,
    pub ub: i64,
    #[serde(default)]
    pub initial_value: Option<i64>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TermSpec {
    pub var_index: usize,
    pub coeff: i64,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinearConstraintSpec {
    pub name: String,
    pub terms: Vec<TermSpec>,
    pub sense: String,
    pub rhs: i64,
}

#[derive(Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LogicNode {
    BoolVar {
        index: usize,
    },
    Linear {
        terms: Vec<TermSpec>,
        sense: String,
        rhs: i64,
    },
    And {
        children: Vec<LogicNode>,
    },
    Or {
        children: Vec<LogicNode>,
    },
    Not {
        child: Box<LogicNode>,
    },
    Implies {
        left: Box<LogicNode>,
        right: Box<LogicNode>,
    },
    Xor {
        children: Vec<LogicNode>,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicalConstraintSpec {
    pub name: String,
    pub expr: LogicNode,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckRequest {
    pub vars: Vec<VarSpec>,
    pub bool_vars: Vec<String>,
    pub constraints: Vec<LinearConstraintSpec>,
    pub logical_constraints: Vec<LogicalConstraintSpec>,
    pub time_limit_ms: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveRequest {
    pub vars: Vec<VarSpec>,
    pub bool_vars: Vec<String>,
    pub constraints: Vec<LinearConstraintSpec>,
    pub logical_constraints: Vec<LogicalConstraintSpec>,
    pub sense: String,
    pub objective_terms: Vec<TermSpec>,
    pub objective_constant: f64,
    pub time_limit_ms: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<Vec<(String, i32)>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bool_values: Option<Vec<(String, bool)>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unsat_core: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveResponse {
    pub status: String,
    pub termination_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub objective_value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<Vec<(String, i32)>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bool_values: Option<Vec<(String, bool)>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IncumbentPayload {
    objective_value: f64,
    values: Vec<(String, i32)>,
    bool_values: Vec<(String, bool)>,
}

struct SolverTermination {
    time_budget: Option<TimeBudget>,
    should_abort: Option<Function>,
    ticks: u32,
    aborted: Rc<Cell<bool>>,
    timed_out: Rc<Cell<bool>>,
}

impl SolverTermination {
    fn new(
        time_limit_ms: Option<u64>,
        should_abort: Option<Function>,
        aborted: Rc<Cell<bool>>,
        timed_out: Rc<Cell<bool>>,
    ) -> Self {
        Self {
            time_budget: time_limit_ms.map(|ms| TimeBudget::starting_now(Duration::from_millis(ms))),
            should_abort,
            ticks: 0,
            aborted,
            timed_out,
        }
    }
}

impl TerminationCondition for SolverTermination {
    fn should_stop(&mut self) -> bool {
        if self.aborted.get() {
            return true;
        }
        if let Some(ref f) = self.should_abort {
            if self.ticks % 512 == 0 {
                match f.call0(&JsValue::NULL) {
                    Ok(val) => {
                        if val.as_bool() == Some(true) {
                            self.aborted.set(true);
                            return true;
                        }
                    }
                    Err(_) => {
                        self.aborted.set(true);
                        return true;
                    }
                }
            }
            self.ticks = self.ticks.wrapping_add(1);
        }
        if let Some(ref mut tb) = self.time_budget {
            if tb.should_stop() {
                self.timed_out.set(true);
                return true;
            }
        }
        false
    }
}

fn create_solver() -> Solver {
    // Use a modest initial nogood arena (4 MB instead of 50 MB) for lightweight WASM memory usage;
    // the underlying Vec grows automatically if additional learned nogoods require more capacity.
    Solver::with_options(SolverOptions {
        memory_preallocated: 4,
        ..Default::default()
    })
}

fn validate_safe_i32(val: i64, context: &str) -> Result<i32, String> {
    if val < -SAFE_I32_LIMIT || val > SAFE_I32_LIMIT {
        return Err(format!(
            "Value out of Pumpkin safe 32-bit integer range [-{SAFE_I32_LIMIT}, {SAFE_I32_LIMIT}] ({context}: got {val})."
        ));
    }
    Ok(val as i32)
}

fn validate_vars(var_specs: &[VarSpec]) -> Result<Vec<(i32, i32)>, String> {
    let mut bounds = Vec::with_capacity(var_specs.len());
    for v in var_specs {
        let lb = validate_safe_i32(v.lb, &format!("variable \"{}\" lb", v.name))?;
        let ub = validate_safe_i32(v.ub, &format!("variable \"{}\" ub", v.name))?;
        if lb > ub {
            return Err(format!(
                "Variable \"{}\" has invalid bounds lb ({lb}) > ub ({ub}).",
                v.name
            ));
        }
        if let Some(init) = v.initial_value {
            let init_i32 = validate_safe_i32(init, &format!("variable \"{}\" initialValue", v.name))?;
            if init_i32 < lb || init_i32 > ub {
                return Err(format!(
                    "Variable \"{}\" has initialValue ({init_i32}) outside its bounds [{lb}, {ub}].",
                    v.name
                ));
            }
        }
        bounds.push((lb, ub));
    }
    Ok(bounds)
}

#[derive(Debug)]
struct PumpkinBrancher {
    warm_start: Option<WarmStart<DomainId>>,
    default: DefaultBrancher,
}

impl PumpkinBrancher {
    fn new(solver: &Solver, var_specs: &[VarSpec], vars: &[DomainId]) -> Self {
        let mut hint_vars = Vec::new();
        let mut hint_vals = Vec::new();
        for (spec, &var) in var_specs.iter().zip(vars.iter()) {
            if let Some(init) = spec.initial_value {
                hint_vars.push(var);
                hint_vals.push(init as i32);
            }
        }
        let warm_start = if hint_vars.is_empty() {
            None
        } else {
            // `WarmStart::new` internally reverses slices and iterates `0..len`;
            // reverse upfront so hints are tried in variable declaration order.
            hint_vars.reverse();
            hint_vals.reverse();
            Some(WarmStart::new(&hint_vars, &hint_vals))
        };
        Self {
            warm_start,
            default: solver.default_brancher(),
        }
    }
}

impl Brancher for PumpkinBrancher {
    fn log_statistics(&self, statistic_logger: StatisticLogger) {
        self.default.log_statistics(statistic_logger);
    }

    fn next_decision(&mut self, context: &mut SelectionContext) -> Option<Predicate> {
        if let Some(ref mut ws) = self.warm_start {
            if let Some(decision) = ws.next_decision(context) {
                return Some(decision);
            }
        }
        self.default.next_decision(context)
    }

    fn on_conflict(&mut self) {
        if let Some(ref mut ws) = self.warm_start {
            ws.on_conflict();
        }
        self.default.on_conflict();
    }

    fn on_backtrack(&mut self) {
        if let Some(ref mut ws) = self.warm_start {
            ws.on_backtrack();
        }
        self.default.on_backtrack();
    }

    fn on_solution(&mut self, solution: SolutionReference) {
        if let Some(ref mut ws) = self.warm_start {
            ws.on_solution(solution);
        }
        self.warm_start = None;
        self.default.on_solution(solution);
    }

    fn on_unassign_integer(&mut self, variable: DomainId, value: i32) {
        if let Some(ref mut ws) = self.warm_start {
            ws.on_unassign_integer(variable, value);
        }
        self.default.on_unassign_integer(variable, value);
    }

    fn on_appearance_in_conflict_predicate(&mut self, predicate: Predicate) {
        if let Some(ref mut ws) = self.warm_start {
            ws.on_appearance_in_conflict_predicate(predicate);
        }
        self.default.on_appearance_in_conflict_predicate(predicate);
    }

    fn on_restart(&mut self) {
        self.warm_start = None;
        self.default.on_restart();
    }

    fn synchronise(&mut self, context: &mut SelectionContext) {
        if let Some(ref mut ws) = self.warm_start {
            ws.synchronise(context);
        }
        self.default.synchronise(context);
    }

    fn is_restart_pointless(&mut self) -> bool {
        // Retire any remaining unsatisfied warm-start prefix at the first restart point so an
        // infeasible or conflicting hint cannot trap search across restarts.
        self.warm_start = None;
        self.default.is_restart_pointless()
    }

    fn subscribe_to_events(&self) -> Vec<BrancherEvent> {
        let mut events = self.default.subscribe_to_events();
        if let Some(ref ws) = self.warm_start {
            for ev in ws.subscribe_to_events() {
                if !events.contains(&ev) {
                    events.push(ev);
                }
            }
        }
        events
    }
}

struct NormalizedLinear {
    terms: Vec<(usize, i32)>,
    rhs: i32,
}

fn normalize_linear(
    var_specs: &[VarSpec],
    terms: &[TermSpec],
    sense: &str,
    rhs: i64,
    context: &str,
) -> Result<NormalizedLinear, String> {
    match sense {
        "<=" | ">=" | "==" => {}
        other => return Err(format!("Unsupported constraint sense: {other}")),
    }

    let safe_rhs = validate_safe_i32(rhs, &format!("RHS of {context}"))?;
    let mut combined: BTreeMap<usize, i64> = BTreeMap::new();
    for t in terms {
        if t.var_index >= var_specs.len() {
            return Err(format!(
                "Variable index {} out of range ({} variables) in {context}.",
                t.var_index,
                var_specs.len()
            ));
        }
        let entry = combined.entry(t.var_index).or_insert(0);
        *entry = entry
            .checked_add(t.coeff)
            .ok_or_else(|| format!("Coefficient sum overflow in {context}."))?;
    }

    let mut norm_terms = Vec::new();
    let mut sum_max_abs: i64 = 0;
    for (idx, coeff_i64) in combined {
        if coeff_i64 == 0 {
            continue;
        }
        let v_spec = &var_specs[idx];
        let coeff = validate_safe_i32(
            coeff_i64,
            &format!("coefficient of \"{}\" in {context}", v_spec.name),
        )?;
        let prod_lb = coeff_i64
            .checked_mul(v_spec.lb)
            .ok_or_else(|| format!("Scaled bound overflow for \"{}\" in {context}.", v_spec.name))?;
        let prod_ub = coeff_i64
            .checked_mul(v_spec.ub)
            .ok_or_else(|| format!("Scaled bound overflow for \"{}\" in {context}.", v_spec.name))?;
        validate_safe_i32(prod_lb, &format!("scaled lb of \"{}\" in {context}", v_spec.name))?;
        validate_safe_i32(prod_ub, &format!("scaled ub of \"{}\" in {context}", v_spec.name))?;

        let term_max_abs = prod_lb.abs().max(prod_ub.abs());
        sum_max_abs = sum_max_abs.saturating_add(term_max_abs);
        norm_terms.push((idx, coeff));
    }

    let total_magnitude = (safe_rhs as i64).abs().saturating_add(sum_max_abs);
    if total_magnitude > (i32::MAX as i64) - 1 {
        return Err(format!(
            "Linear expression magnitude ({total_magnitude}) in {context} exceeds Pumpkin safe 32-bit propagator range."
        ));
    }

    Ok(NormalizedLinear {
        terms: norm_terms,
        rhs: safe_rhs,
    })
}

fn validate_logic_node(
    var_specs: &[VarSpec],
    num_bools: usize,
    node: &LogicNode,
    context: &str,
) -> Result<(), String> {
    match node {
        LogicNode::BoolVar { index } => {
            if *index >= num_bools {
                return Err(format!(
                    "Boolean variable index {index} out of range ({num_bools} boolVars) in {context}."
                ));
            }
            Ok(())
        }
        LogicNode::Linear { terms, sense, rhs } => {
            normalize_linear(var_specs, terms, sense, *rhs, context).map(|_| ())
        }
        LogicNode::Not { child } => validate_logic_node(var_specs, num_bools, child, context),
        LogicNode::Implies { left, right } => {
            validate_logic_node(var_specs, num_bools, left, context)?;
            validate_logic_node(var_specs, num_bools, right, context)
        }
        LogicNode::And { children }
        | LogicNode::Or { children }
        | LogicNode::Xor { children } => {
            for ch in children {
                validate_logic_node(var_specs, num_bools, ch, context)?;
            }
            Ok(())
        }
    }
}

fn build_scaled_terms(vars: &[DomainId], terms: &[(usize, i32)]) -> Vec<AffineView<DomainId>> {
    terms
        .iter()
        .map(|&(idx, coeff)| vars[idx].scaled(coeff))
        .collect()
}

fn eval_zero_linear(sense: &str, rhs: i32) -> Result<bool, String> {
    match sense {
        "<=" => Ok(0 <= rhs),
        ">=" => Ok(0 >= rhs),
        "==" => Ok(0 == rhs),
        other => Err(format!("Unsupported constraint sense: {other}")),
    }
}

/// Returns `Ok(false)` if posting triggered root inconsistency (only possible when `implied_by_lit` is `None`).
fn post_linear(
    solver: &mut Solver,
    var_specs: &[VarSpec],
    vars: &[DomainId],
    terms: &[TermSpec],
    sense: &str,
    rhs: i64,
    context: &str,
    implied_by_lit: Option<Literal>,
) -> Result<bool, String> {
    let norm = normalize_linear(var_specs, terms, sense, rhs, context)?;
    let tag = solver.new_constraint_tag();
    let scaled = build_scaled_terms(vars, &norm.terms);

    if scaled.is_empty() {
        let holds = eval_zero_linear(sense, norm.rhs)?;
        if !holds {
            match implied_by_lit {
                Some(sel) => solver.add_constraint(clause([!sel], tag)).post(),
                None => return Ok(false),
            }
        }
        return Ok(true);
    }

    match (sense, implied_by_lit) {
        ("<=", None) => solver
            .add_constraint(less_than_or_equals(scaled, norm.rhs, tag))
            .post(),
        ("<=", Some(sel)) => solver
            .add_constraint(less_than_or_equals(scaled, norm.rhs, tag))
            .implied_by(sel),
        (">=", None) => solver
            .add_constraint(greater_than_or_equals(scaled, norm.rhs, tag))
            .post(),
        (">=", Some(sel)) => solver
            .add_constraint(greater_than_or_equals(scaled, norm.rhs, tag))
            .implied_by(sel),
        ("==", None) => solver.add_constraint(equals(scaled, norm.rhs, tag)).post(),
        ("==", Some(sel)) => solver
            .add_constraint(equals(scaled, norm.rhs, tag))
            .implied_by(sel),
        (other, _) => return Err(format!("Unsupported constraint sense: {other}")),
    }

    Ok(!solver.is_inconsistent())
}

fn new_safe_literal(solver: &mut Solver) -> Option<Literal> {
    if solver.is_inconsistent() {
        None
    } else {
        Some(solver.new_literal())
    }
}

enum Reified {
    Lit(Literal),
    Inconsistent,
}

fn reify_logic_node(
    solver: &mut Solver,
    var_specs: &[VarSpec],
    vars: &[DomainId],
    bool_lits: &[Literal],
    node: &LogicNode,
    context: &str,
) -> Result<Reified, String> {
    if solver.is_inconsistent() {
        return Ok(Reified::Inconsistent);
    }
    match node {
        LogicNode::BoolVar { index } => Ok(Reified::Lit(bool_lits[*index])),
        LogicNode::Not { child } => match reify_logic_node(solver, var_specs, vars, bool_lits, child, context)? {
            Reified::Lit(lit) => Ok(Reified::Lit(!lit)),
            Reified::Inconsistent => Ok(Reified::Inconsistent),
        },
        LogicNode::Linear { terms, sense, rhs } => {
            let norm = normalize_linear(var_specs, terms, sense, *rhs, context)?;
            let Some(lit) = new_safe_literal(solver) else {
                return Ok(Reified::Inconsistent);
            };
            let tag = solver.new_constraint_tag();
            let scaled = build_scaled_terms(vars, &norm.terms);
            if scaled.is_empty() {
                let holds = eval_zero_linear(sense, norm.rhs)?;
                solver
                    .add_constraint(clause([if holds { lit } else { !lit }], tag))
                    .post();
                return Ok(Reified::Lit(lit));
            }
            match sense.as_str() {
                "<=" => solver
                    .add_constraint(less_than_or_equals(scaled, norm.rhs, tag))
                    .reify(lit),
                ">=" => solver
                    .add_constraint(greater_than_or_equals(scaled, norm.rhs, tag))
                    .reify(lit),
                "==" => solver
                    .add_constraint(equals(scaled, norm.rhs, tag))
                    .reify(lit),
                other => return Err(format!("Unsupported linear sense in logic: {other}")),
            }
            if solver.is_inconsistent() {
                return Ok(Reified::Inconsistent);
            }
            Ok(Reified::Lit(lit))
        }
        LogicNode::And { children } => {
            let mut child_lits = Vec::with_capacity(children.len());
            for ch in children {
                match reify_logic_node(solver, var_specs, vars, bool_lits, ch, context)? {
                    Reified::Lit(l) => child_lits.push(l),
                    Reified::Inconsistent => return Ok(Reified::Inconsistent),
                }
            }
            let Some(lit) = new_safe_literal(solver) else {
                return Ok(Reified::Inconsistent);
            };
            let tag = solver.new_constraint_tag();
            if child_lits.is_empty() {
                solver.add_constraint(clause([lit], tag)).post();
            } else {
                solver
                    .add_constraint(conjunction(child_lits, tag))
                    .reify(lit);
            }
            if solver.is_inconsistent() {
                return Ok(Reified::Inconsistent);
            }
            Ok(Reified::Lit(lit))
        }
        LogicNode::Or { children } => {
            let mut child_lits = Vec::with_capacity(children.len());
            for ch in children {
                match reify_logic_node(solver, var_specs, vars, bool_lits, ch, context)? {
                    Reified::Lit(l) => child_lits.push(l),
                    Reified::Inconsistent => return Ok(Reified::Inconsistent),
                }
            }
            let Some(lit) = new_safe_literal(solver) else {
                return Ok(Reified::Inconsistent);
            };
            let tag = solver.new_constraint_tag();
            if child_lits.is_empty() {
                solver.add_constraint(clause([!lit], tag)).post();
            } else {
                solver.add_constraint(clause(child_lits, tag)).reify(lit);
            }
            if solver.is_inconsistent() {
                return Ok(Reified::Inconsistent);
            }
            Ok(Reified::Lit(lit))
        }
        LogicNode::Implies { left, right } => {
            let l_lit = match reify_logic_node(solver, var_specs, vars, bool_lits, left, context)? {
                Reified::Lit(l) => l,
                Reified::Inconsistent => return Ok(Reified::Inconsistent),
            };
            let r_lit = match reify_logic_node(solver, var_specs, vars, bool_lits, right, context)? {
                Reified::Lit(r) => r,
                Reified::Inconsistent => return Ok(Reified::Inconsistent),
            };
            let Some(out) = new_safe_literal(solver) else {
                return Ok(Reified::Inconsistent);
            };
            let tag = solver.new_constraint_tag();
            solver.add_constraint(clause([!l_lit, r_lit], tag)).reify(out);
            if solver.is_inconsistent() {
                return Ok(Reified::Inconsistent);
            }
            Ok(Reified::Lit(out))
        }
        LogicNode::Xor { children } => {
            if children.is_empty() {
                let Some(lit) = new_safe_literal(solver) else {
                    return Ok(Reified::Inconsistent);
                };
                let tag = solver.new_constraint_tag();
                solver.add_constraint(clause([!lit], tag)).post();
                return Ok(Reified::Lit(lit));
            }
            let mut acc = match reify_logic_node(solver, var_specs, vars, bool_lits, &children[0], context)? {
                Reified::Lit(l) => l,
                Reified::Inconsistent => return Ok(Reified::Inconsistent),
            };
            for ch in &children[1..] {
                let rhs = match reify_logic_node(solver, var_specs, vars, bool_lits, ch, context)? {
                    Reified::Lit(r) => r,
                    Reified::Inconsistent => return Ok(Reified::Inconsistent),
                };
                let Some(next) = new_safe_literal(solver) else {
                    return Ok(Reified::Inconsistent);
                };
                // next <-> (acc != rhs)
                let t1 = solver.new_constraint_tag();
                solver.add_constraint(clause([!acc, !rhs, !next], t1)).post();
                let t2 = solver.new_constraint_tag();
                solver.add_constraint(clause([acc, rhs, !next], t2)).post();
                let t3 = solver.new_constraint_tag();
                solver.add_constraint(clause([acc, !rhs, next], t3)).post();
                let t4 = solver.new_constraint_tag();
                solver.add_constraint(clause([!acc, rhs, next], t4)).post();
                if solver.is_inconsistent() {
                    return Ok(Reified::Inconsistent);
                }
                acc = next;
            }
            Ok(Reified::Lit(acc))
        }
    }
}

fn post_top_level_logic(
    solver: &mut Solver,
    var_specs: &[VarSpec],
    vars: &[DomainId],
    bool_lits: &[Literal],
    node: &LogicNode,
    context: &str,
    implied_by_lit: Option<Literal>,
) -> Result<bool, String> {
    match reify_logic_node(solver, var_specs, vars, bool_lits, node, context)? {
        Reified::Inconsistent => Ok(false),
        Reified::Lit(root_lit) => {
            let tag = solver.new_constraint_tag();
            match implied_by_lit {
                None => solver.add_constraint(clause([root_lit], tag)).post(),
                Some(sel) => solver.add_constraint(clause([!sel, root_lit], tag)).post(),
            }
            Ok(!solver.is_inconsistent())
        }
    }
}

fn extract_solution<S: ProblemSolution>(
    sol: &S,
    var_specs: &[VarSpec],
    vars: &[DomainId],
    bool_names: &[String],
    bool_lits: &[Literal],
) -> (Vec<(String, i32)>, Vec<(String, bool)>) {
    let mut values = Vec::with_capacity(var_specs.len());
    for (spec, &v) in var_specs.iter().zip(vars.iter()) {
        values.push((spec.name.clone(), sol.get_integer_value(v)));
    }
    let mut bool_values = Vec::with_capacity(bool_names.len());
    for (name, &lit) in bool_names.iter().zip(bool_lits.iter()) {
        bool_values.push((name.clone(), sol.get_literal_value(lit)));
    }
    (values, bool_values)
}

fn check_error_response(message: String) -> String {
    serde_json::to_string(&CheckResponse {
        status: "Error".into(),
        values: None,
        bool_values: None,
        unsat_core: None,
        error: Some(message),
    })
    .unwrap()
}

fn solve_error_response(message: String) -> String {
    serde_json::to_string(&SolveResponse {
        status: "Error".into(),
        termination_status: "Error".into(),
        objective_value: None,
        values: None,
        bool_values: None,
        error: Some(message),
    })
    .unwrap()
}

#[wasm_bindgen]
pub fn check_with_callback(request_json: &str, should_abort: Option<Function>) -> String {
    let req: CheckRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return check_error_response(format!("Invalid CheckRequest JSON: {e}")),
    };

    // Validate all inputs up front before posting any constraints
    let var_bounds = match validate_vars(&req.vars) {
        Ok(b) => b,
        Err(e) => return check_error_response(e),
    };
    for c in &req.constraints {
        if let Err(e) = normalize_linear(
            &req.vars,
            &c.terms,
            &c.sense,
            c.rhs,
            &format!("constraint \"{}\"", c.name),
        ) {
            return check_error_response(e);
        }
    }
    for lc in &req.logical_constraints {
        if let Err(e) = validate_logic_node(
            &req.vars,
            req.bool_vars.len(),
            &lc.expr,
            &format!("logical constraint \"{}\"", lc.name),
        ) {
            return check_error_response(e);
        }
    }

    let mut solver = create_solver();
    let vars: Vec<DomainId> = req
        .vars
        .iter()
        .zip(var_bounds.iter())
        .map(|(v, &(lb, ub))| solver.new_named_bounded_integer(lb, ub, v.name.clone()))
        .collect();
    let bool_lits: Vec<Literal> = req
        .bool_vars
        .iter()
        .map(|b| solver.new_named_literal(b.clone()))
        .collect();

    // Pre-allocate all assumption selector literals before posting any constraints
    let mut assumptions = Vec::with_capacity(req.constraints.len() + req.logical_constraints.len());
    let mut pred_to_name = HashMap::new();
    let mut constr_sels = Vec::with_capacity(req.constraints.len());
    for c in &req.constraints {
        let sel = solver.new_literal();
        let pred = sel.get_true_predicate();
        assumptions.push(pred);
        pred_to_name.insert(pred, c.name.clone());
        constr_sels.push(sel);
    }
    let mut logic_sels = Vec::with_capacity(req.logical_constraints.len());
    for lc in &req.logical_constraints {
        let sel = solver.new_literal();
        let pred = sel.get_true_predicate();
        assumptions.push(pred);
        pred_to_name.insert(pred, lc.name.clone());
        logic_sels.push(sel);
    }

    for (c, sel) in req.constraints.iter().zip(constr_sels.into_iter()) {
        match post_linear(
            &mut solver,
            &req.vars,
            &vars,
            &c.terms,
            &c.sense,
            c.rhs,
            &format!("constraint \"{}\"", c.name),
            Some(sel),
        ) {
            Ok(true) => {}
            Ok(false) => {
                return serde_json::to_string(&CheckResponse {
                    status: "Unsat".into(),
                    values: None,
                    bool_values: None,
                    unsat_core: Some(Vec::new()),
                    error: None,
                })
                .unwrap();
            }
            Err(err) => return check_error_response(err),
        }
    }

    for (lc, sel) in req.logical_constraints.iter().zip(logic_sels.into_iter()) {
        match post_top_level_logic(
            &mut solver,
            &req.vars,
            &vars,
            &bool_lits,
            &lc.expr,
            &format!("logical constraint \"{}\"", lc.name),
            Some(sel),
        ) {
            Ok(true) => {}
            Ok(false) => {
                return serde_json::to_string(&CheckResponse {
                    status: "Unsat".into(),
                    values: None,
                    bool_values: None,
                    unsat_core: Some(Vec::new()),
                    error: None,
                })
                .unwrap();
            }
            Err(err) => return check_error_response(err),
        }
    }

    let aborted = Rc::new(Cell::new(false));
    let timed_out = Rc::new(Cell::new(false));
    let mut termination = SolverTermination::new(
        req.time_limit_ms,
        should_abort,
        Rc::clone(&aborted),
        Rc::clone(&timed_out),
    );
    let mut brancher = PumpkinBrancher::new(&solver, &req.vars, &vars);
    let mut resolver = ResolutionResolver::default();

    let result = solver.satisfy_under_assumptions(
        &mut brancher,
        &mut termination,
        &mut resolver,
        &assumptions,
    );

    let resp = match result {
        SatisfactionResultUnderAssumptions::Satisfiable(sat) => {
            let sol = sat.solution();
            let (values, bool_values) =
                extract_solution(&sol, &req.vars, &vars, &req.bool_vars, &bool_lits);
            CheckResponse {
                status: "Sat".into(),
                values: Some(values),
                bool_values: Some(bool_values),
                unsat_core: None,
                error: None,
            }
        }
        SatisfactionResultUnderAssumptions::UnsatisfiableUnderAssumptions(mut unsat) => {
            let core_preds = unsat.extract_core();
            let mut core_names = Vec::new();
            for p in core_preds.iter() {
                if let Some(name) = pred_to_name.get(p) {
                    core_names.push(name.clone());
                }
            }
            CheckResponse {
                status: "Unsat".into(),
                values: None,
                bool_values: None,
                unsat_core: Some(core_names),
                error: None,
            }
        }
        SatisfactionResultUnderAssumptions::Unsatisfiable(_) => CheckResponse {
            status: "Unsat".into(),
            values: None,
            bool_values: None,
            unsat_core: Some(Vec::new()),
            error: None,
        },
        SatisfactionResultUnderAssumptions::Unknown(_) => CheckResponse {
            status: "Unknown".into(),
            values: None,
            bool_values: None,
            unsat_core: None,
            error: None,
        },
    };

    serde_json::to_string(&resp).unwrap()
}

#[wasm_bindgen]
pub fn solve_with_callback(
    request_json: &str,
    on_event: Option<Function>,
    should_abort: Option<Function>,
) -> String {
    let req: SolveRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return solve_error_response(format!("Invalid SolveRequest JSON: {e}")),
    };

    if !req.objective_constant.is_finite() {
        return solve_error_response("Objective constant must be finite.".into());
    }

    // Validate all variables, constraints, logic, and objective upfront
    let var_bounds = match validate_vars(&req.vars) {
        Ok(b) => b,
        Err(e) => return solve_error_response(e),
    };
    for c in &req.constraints {
        if let Err(e) = normalize_linear(
            &req.vars,
            &c.terms,
            &c.sense,
            c.rhs,
            &format!("constraint \"{}\"", c.name),
        ) {
            return solve_error_response(e);
        }
    }
    for lc in &req.logical_constraints {
        if let Err(e) = validate_logic_node(
            &req.vars,
            req.bool_vars.len(),
            &lc.expr,
            &format!("logical constraint \"{}\"", lc.name),
        ) {
            return solve_error_response(e);
        }
    }

    let obj_norm = match normalize_linear(
        &req.vars,
        &req.objective_terms,
        "==",
        0,
        "objective expression",
    ) {
        Ok(n) => n,
        Err(e) => return solve_error_response(e),
    };

    let mut obj_lb_i64: i64 = 0;
    let mut obj_ub_i64: i64 = 0;
    let mut obj_max_abs: i64 = 0;
    for &(idx, coeff) in &obj_norm.terms {
        let v_spec = &req.vars[idx];
        let c = coeff as i64;
        let a = c * v_spec.lb;
        let b = c * v_spec.ub;
        obj_lb_i64 = obj_lb_i64.saturating_add(a.min(b));
        obj_ub_i64 = obj_ub_i64.saturating_add(a.max(b));
        obj_max_abs = obj_max_abs.saturating_add(a.abs().max(b.abs()));
    }
    if obj_max_abs > SAFE_I32_LIMIT {
        return solve_error_response(format!(
            "Objective expression bound magnitude ({obj_max_abs}) exceeds Pumpkin safe 32-bit integer range [-{SAFE_I32_LIMIT}, {SAFE_I32_LIMIT}]."
        ));
    }

    // Pre-allocate all variables (including objective variable) at clean root before posting constraints
    let mut solver = create_solver();
    let vars: Vec<DomainId> = req
        .vars
        .iter()
        .zip(var_bounds.iter())
        .map(|(v, &(lb, ub))| solver.new_named_bounded_integer(lb, ub, v.name.clone()))
        .collect();
    let bool_lits: Vec<Literal> = req
        .bool_vars
        .iter()
        .map(|b| solver.new_named_literal(b.clone()))
        .collect();

    let obj_var = if obj_norm.terms.is_empty() {
        None
    } else {
        Some(solver.new_bounded_integer(obj_lb_i64 as i32, obj_ub_i64 as i32))
    };

    for c in &req.constraints {
        match post_linear(
            &mut solver,
            &req.vars,
            &vars,
            &c.terms,
            &c.sense,
            c.rhs,
            &format!("constraint \"{}\"", c.name),
            None,
        ) {
            Ok(true) => {}
            Ok(false) => {
                return serde_json::to_string(&SolveResponse {
                    status: "Infeasible".into(),
                    termination_status: "Infeasible".into(),
                    objective_value: None,
                    values: None,
                    bool_values: None,
                    error: None,
                })
                .unwrap();
            }
            Err(err) => return solve_error_response(err),
        }
    }

    for lc in &req.logical_constraints {
        match post_top_level_logic(
            &mut solver,
            &req.vars,
            &vars,
            &bool_lits,
            &lc.expr,
            &format!("logical constraint \"{}\"", lc.name),
            None,
        ) {
            Ok(true) => {}
            Ok(false) => {
                return serde_json::to_string(&SolveResponse {
                    status: "Infeasible".into(),
                    termination_status: "Infeasible".into(),
                    objective_value: None,
                    values: None,
                    bool_values: None,
                    error: None,
                })
                .unwrap();
            }
            Err(err) => return solve_error_response(err),
        }
    }

    let aborted = Rc::new(Cell::new(false));
    let timed_out = Rc::new(Cell::new(false));
    let mut termination = SolverTermination::new(
        req.time_limit_ms,
        should_abort,
        Rc::clone(&aborted),
        Rc::clone(&timed_out),
    );
    let mut brancher = PumpkinBrancher::new(&solver, &req.vars, &vars);
    let mut resolver = ResolutionResolver::default();

    let Some(obj_var) = obj_var else {
        let sat_res = solver.satisfy(&mut brancher, &mut termination, &mut resolver);
        let resp = match sat_res {
            SatisfactionResult::Satisfiable(sat) => {
                let sol = sat.solution();
                let (values, bool_values) =
                    extract_solution(&sol, &req.vars, &vars, &req.bool_vars, &bool_lits);
                if let Some(ref cb) = on_event {
                    let payload = serde_json::to_string(&IncumbentPayload {
                        objective_value: req.objective_constant,
                        values: values.clone(),
                        bool_values: bool_values.clone(),
                    })
                    .unwrap();
                    if let Ok(ret) = cb.call1(&JsValue::NULL, &JsValue::from_str(&payload)) {
                        if ret.as_bool() == Some(true) {
                            aborted.set(true);
                        }
                    } else {
                        aborted.set(true);
                    }
                }
                if aborted.get() {
                    SolveResponse {
                        status: "Feasible".into(),
                        termination_status: "Interrupted".into(),
                        objective_value: Some(req.objective_constant),
                        values: Some(values),
                        bool_values: Some(bool_values),
                        error: None,
                    }
                } else {
                    SolveResponse {
                        status: "Optimal".into(),
                        termination_status: "Optimal".into(),
                        objective_value: Some(req.objective_constant),
                        values: Some(values),
                        bool_values: Some(bool_values),
                        error: None,
                    }
                }
            }
            SatisfactionResult::Unsatisfiable(_, _, _) => SolveResponse {
                status: "Infeasible".into(),
                termination_status: "Infeasible".into(),
                objective_value: None,
                values: None,
                bool_values: None,
                error: None,
            },
            SatisfactionResult::Unknown(_, _, _) => {
                if aborted.get() {
                    SolveResponse {
                        status: "Unknown".into(),
                        termination_status: "Interrupted".into(),
                        objective_value: None,
                        values: None,
                        bool_values: None,
                        error: None,
                    }
                } else if timed_out.get() || req.time_limit_ms.is_some() {
                    SolveResponse {
                        status: "TimeLimit".into(),
                        termination_status: "TimeLimit".into(),
                        objective_value: None,
                        values: None,
                        bool_values: None,
                        error: None,
                    }
                } else {
                    SolveResponse {
                        status: "Unknown".into(),
                        termination_status: "Unknown".into(),
                        objective_value: None,
                        values: None,
                        bool_values: None,
                        error: None,
                    }
                }
            }
        };
        return serde_json::to_string(&resp).unwrap();
    };

    let mut eq_terms: Vec<AffineView<DomainId>> = build_scaled_terms(&vars, &obj_norm.terms);
    eq_terms.push(obj_var.scaled(-1));
    let obj_tag = solver.new_constraint_tag();
    solver.add_constraint(equals(eq_terms, 0, obj_tag)).post();

    if solver.is_inconsistent() {
        return serde_json::to_string(&SolveResponse {
            status: "Infeasible".into(),
            termination_status: "Infeasible".into(),
            objective_value: None,
            values: None,
            bool_values: None,
            error: None,
        })
        .unwrap();
    }

    let direction = if req.sense.eq_ignore_ascii_case("maximize") {
        OptimisationDirection::Maximise
    } else {
        OptimisationDirection::Minimise
    };

    let callback = |_: &Solver,
                    sol: SolutionReference,
                    _: &PumpkinBrancher,
                    _: &ResolutionResolver|
     -> ControlFlow<()> {
        if let Some(ref cb) = on_event {
            let raw_obj = sol.get_integer_value(obj_var) as f64 + req.objective_constant;
            let (values, bool_values) =
                extract_solution(&sol, &req.vars, &vars, &req.bool_vars, &bool_lits);
            let payload = serde_json::to_string(&IncumbentPayload {
                objective_value: raw_obj,
                values,
                bool_values,
            })
            .unwrap();
            match cb.call1(&JsValue::NULL, &JsValue::from_str(&payload)) {
                Ok(ret) if ret.as_bool() == Some(true) => {
                    aborted.set(true);
                    return ControlFlow::Break(());
                }
                Err(_) => {
                    aborted.set(true);
                    return ControlFlow::Break(());
                }
                _ => {}
            }
        }
        ControlFlow::Continue(())
    };

    let opt_res = solver.optimise(
        &mut brancher,
        &mut termination,
        &mut resolver,
        LinearSatUnsat::new(direction, obj_var, callback),
    );

    let resp = match opt_res {
        OptimisationResult::Optimal(sol) => {
            let raw_obj = sol.get_integer_value(obj_var) as f64 + req.objective_constant;
            let (values, bool_values) =
                extract_solution(&sol, &req.vars, &vars, &req.bool_vars, &bool_lits);
            SolveResponse {
                status: "Optimal".into(),
                termination_status: "Optimal".into(),
                objective_value: Some(raw_obj),
                values: Some(values),
                bool_values: Some(bool_values),
                error: None,
            }
        }
        OptimisationResult::Stopped(sol, _) => {
            let raw_obj = sol.get_integer_value(obj_var) as f64 + req.objective_constant;
            let (values, bool_values) =
                extract_solution(&sol, &req.vars, &vars, &req.bool_vars, &bool_lits);
            SolveResponse {
                status: "Feasible".into(),
                termination_status: "Interrupted".into(),
                objective_value: Some(raw_obj),
                values: Some(values),
                bool_values: Some(bool_values),
                error: None,
            }
        }
        OptimisationResult::Satisfiable(sol) => {
            let raw_obj = sol.get_integer_value(obj_var) as f64 + req.objective_constant;
            let (values, bool_values) =
                extract_solution(&sol, &req.vars, &vars, &req.bool_vars, &bool_lits);
            let term = if aborted.get() {
                "Interrupted"
            } else if timed_out.get() || req.time_limit_ms.is_some() {
                "TimeLimit"
            } else {
                "Feasible"
            };
            SolveResponse {
                status: "Feasible".into(),
                termination_status: term.into(),
                objective_value: Some(raw_obj),
                values: Some(values),
                bool_values: Some(bool_values),
                error: None,
            }
        }
        OptimisationResult::Unsatisfiable => SolveResponse {
            status: "Infeasible".into(),
            termination_status: "Infeasible".into(),
            objective_value: None,
            values: None,
            bool_values: None,
            error: None,
        },
        OptimisationResult::Unknown => {
            let (status, term) = if aborted.get() {
                ("Unknown", "Interrupted")
            } else if timed_out.get() || req.time_limit_ms.is_some() {
                ("TimeLimit", "TimeLimit")
            } else {
                ("Unknown", "Unknown")
            };
            SolveResponse {
                status: status.into(),
                termination_status: term.into(),
                objective_value: None,
                values: None,
                bool_values: None,
                error: None,
            }
        }
    };

    serde_json::to_string(&resp).unwrap()
}

#[wasm_bindgen]
pub fn check_json(request_json: &str) -> String {
    check_with_callback(request_json, None)
}

#[wasm_bindgen]
pub fn solve_json(request_json: &str) -> String {
    solve_with_callback(request_json, None, None)
}
