import { spawn } from 'child_process'
import { join } from 'path'

function extractJson(text: string): string {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return text
  return text.slice(first, last + 1)
}

export function runAnalyzePy(input: object): Promise<object> {
  return new Promise((resolve, reject) => {
    const py = spawn('python', [join(process.cwd(), 'scripts', 'analyze.py')], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    let out = ''
    let err = ''
    py.stdout.on('data', (d: Buffer) => { out += d.toString() })
    py.stderr.on('data', (d: Buffer) => { err += d.toString() })
    py.on('close', (code: number) => {
      if (code !== 0) { reject(new Error(err || `exit ${code}`)); return }
      const jsonText = extractJson(out)
      try { resolve(JSON.parse(jsonText)) }
      catch { reject(new Error(`JSON parse 실패: ${jsonText}`)) }
    })
    py.stdin.write(JSON.stringify(input))
    py.stdin.end()
  })
}
