// Pulls plain text out of a resume file in the browser. Nothing is uploaded.
// PDF via pdf.js, Word (.docx) via mammoth, plain text as is. The readers are
// loaded on demand so they don't slow down the first page load.

export class ResumeReadError extends Error {}

const MAX_BYTES = 8 * 1024 * 1024

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  const pages: string[] = []
  for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    let line = ''
    const lines: string[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      line += item.str
      if (item.hasEOL) {
        lines.push(line)
        line = ''
      } else if (!line.endsWith(' ')) {
        line += ' '
      }
    }
    if (line) lines.push(line)
    pages.push(lines.join('\n'))
  }
  await task.destroy()
  return pages.join('\n')
}

async function docxText(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value
}

export async function extractResumeText(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new ResumeReadError('That file is over 8 MB. Try a smaller PDF or Word file.')
  const name = file.name.toLowerCase()
  let text: string
  try {
    if (name.endsWith('.pdf') || file.type === 'application/pdf') text = await pdfText(file)
    else if (name.endsWith('.docx')) text = await docxText(file)
    else if (name.endsWith('.txt') || file.type.startsWith('text/')) text = await file.text()
    else if (name.endsWith('.doc'))
      throw new ResumeReadError('Older .doc files can’t be read here. Save it as a PDF or .docx and try again.')
    else throw new ResumeReadError('Upload a PDF, Word (.docx) or plain-text file.')
  } catch (e) {
    if (e instanceof ResumeReadError) throw e
    throw new ResumeReadError('That file couldn’t be opened. It may be damaged or password protected.')
  }
  const clean = text.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim()
  if (clean.length < 80) {
    throw new ResumeReadError(
      'We couldn’t find text in that file. If it’s a scanned image, try a PDF exported from Word or Google Docs.',
    )
  }
  return clean
}
