export function normalizePexels(data) {
  return data.photos.map(item => ({
    id: item.id,
    type: 'image',
    source: 'pexels',
    url: item.src.original,
    width: item.width,
    height: item.height
  }));
}
