const {imagekit} = require("./config/config")
async function mp3Upload(file, fileName) {
    try {
        const result = await imagekit.upload({ file, fileName })
        return result.url
    } catch (err) {
        console.error("Upload error:", err.message || err)
    }
}

module.exports = {mp3Upload}