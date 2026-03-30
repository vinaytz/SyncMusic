const { getImagekit } = require("./config/config")
async function mp3Upload(file, fileName) {
    try {
        const imagekit = getImagekit();
        if (!imagekit) throw new Error("ImageKit not configured — set IMAGEKIT env vars");
        const result = await imagekit.upload({ file, fileName })
        return result.url
    } catch (err) {
        console.error("Upload error:", err.message || err)
    }
}

module.exports = {mp3Upload}