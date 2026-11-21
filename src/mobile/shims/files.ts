import { NeedsComputer } from './ai'
export const SUPPORTED_SOURCE_EXT = ['.pdf', '.docx', '.pptx', '.txt', '.md', '.markdown']
export async function extractText(): Promise<never> {
  throw new NeedsComputer()
}
export async function pdfPageCount(): Promise<never> {
  throw new NeedsComputer()
}
export async function prepareSources(): Promise<never> {
  throw new NeedsComputer()
}
