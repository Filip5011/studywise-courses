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
// Plain helpers the course code uses; on the phone they only ever see file names.
export const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
export const isImageFile = (f: string) => IMAGE_EXT.some((e) => f.toLowerCase().endsWith(e))
