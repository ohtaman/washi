export interface DocSection {
  title: string;
  dir: string;
  files: string[];
}

export interface LlmsArtifacts {
  llmsTxt: string;
  llmsFullTxt: string;
  sections: DocSection[];
  allDocFiles: string[];
  docPathPrefix: string;
}

export interface BuildLlmsOptions {
  docPathPrefix?: string;
}

export const DOC_SECTIONS: readonly DocSection[];
export const LLMS_FULL_SECTIONS: readonly string[];

export function getCanonicalDocSections(docsDir?: string): DocSection[];
export function stripVitePressSyntax(
  rawMarkdown: string,
  relPath?: string,
  docPathPrefix?: string
): string;
export function extractDocMetadata(rawMarkdown: string): { title: string; summary: string };
export function buildLlmsArtifacts(rootDir?: string, options?: BuildLlmsOptions): LlmsArtifacts;
export function populateSiteLlmsAssets(
  targetSiteDir: string,
  rootDir?: string,
  artifacts?: LlmsArtifacts
): void;
export function generateLlms(rootDir?: string): LlmsArtifacts;
