import { getPinSvg } from './MapPin'

export function pinDataUrl(ftype: string, selected = false): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(getPinSvg(ftype, selected ? 48 : 40, selected))
}
