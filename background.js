chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "createSheet") {
    createSheet(request.data);
  }
  return true;
});

async function createSheet(request) {
  try {
    console.log(request, "REQUEST DATA...");
    const { data, sheetName } = request;
    const token = await getToken();
    const sheetId = await createGoogleSheet(token);
    chrome.tabs.create({
      url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

function getToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      token ? resolve(token) : reject(new Error("Error de autenticación"));
    });
  });
}

async function createGoogleSheet(token) {
  const response = await fetch(
    "https://sheets.googleapis.com/v4/spreadsheets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          title: "Stock performance resume",
        },
      }),
    }
  );

  const data = await response.json();
  return data.spreadsheetId;
}
