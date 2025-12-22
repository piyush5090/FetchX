console.log("OFFSCREEN ZIP LOADED");

let zip;
let chunks = [];

/* Create ZIP instance */
function initZip() {
  chunks = [];

  zip = new fflate.Zip((err, chunk, final) => {
    if (err) {
      console.error("ZIP error:", err);
      return;
    }

    if (chunk) {
      chunks.push(chunk);
    }

    if (final) {
      console.log("ZIP FINALIZED");

      const blob = new Blob(chunks, { type: "application/zip" });
      const url = URL.createObjectURL(blob);

      chrome.downloads.download({
        url,
        filename: "FetchX.zip",
        saveAs: true,
      });
    }
  });
}

/* Message bridge */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "ZIP_INIT") {
    initZip();
  }

  if (msg.type === "ZIP_ADD") {
    if (!zip) return;
    zip.add(msg.filename, msg.buffer);
  }

  if (msg.type === "ZIP_FINALIZE") {
    if (!zip) return;
    zip.end();
  }
});
