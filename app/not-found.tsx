export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h2 className="text-2xl font-bold text-gray-900">페이지를 찾을 수 없습니다</h2>
      <p className="mt-2 text-sm text-gray-500">요청하신 페이지가 존재하지 않거나 이동되었습니다.</p>
    </div>
  )
}
