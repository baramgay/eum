describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await fetch('http://localhost:3001/api/health')
    const data = await res.json()
    expect(data.status).toBe('ok')
  })
})
