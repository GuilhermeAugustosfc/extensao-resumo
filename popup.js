document
  .getElementById("getCurrentVideo")
  .addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (tab.url.includes("youtube.com/watch")) {
      chrome.tabs.sendMessage(
        tab.id,
        { action: "getVideoTitle" },
        (response) => {
          if (response) {
            document.getElementById("videoTitle").textContent = response.title;
          }
        }
      );
    } else {
      document.getElementById("videoTitle").textContent =
        "Por favor, abra um vídeo do YouTube";
    }
  });
