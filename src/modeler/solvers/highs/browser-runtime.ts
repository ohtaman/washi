import createHiGHS from "./runtime.js";
import { Highs } from "./driver.js";

export default async function loadBrowserHighs(options: any = {}): Promise<Highs> {
  const module = await createHiGHS(options);
  return new Highs(module);
}
