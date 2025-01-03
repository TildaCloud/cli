export default function imageLoader({ src, width, quality }) {
    const params = [`width=${width}`, `quality=${quality || 75}`, 'format=auto']
    return `/_tilda/image/${params.join(',')}/${src.toString().startsWith('/') ? src.slice(1) : src}`
}
