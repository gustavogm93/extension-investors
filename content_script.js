// content_script.js
var financialData;
var intrensicValues;
function transformBValues(obj) {
  // Verificamos si no es objeto (o es null), retornamos tal cual.
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  // Recorremos todas las claves del objeto
  for (let key in obj) {
    const value = obj[key];

    // Si es un objeto, recursión
    if (typeof value === "object" && value !== null) {
      obj[key] = transformBValues(value);
    }
    // Si es string, buscamos la "B"
    else if (typeof value === "string") {
      // Normalizamos un poco para evitar caracteres ocultos
      let cleanValue = value.replace(
        /\u202C|\u202A|\u202B|\u202D|\u202E|\u200B|\u200C|\u200D|\uFEFF/g,
        ""
      );
      if (cleanValue.includes("B")) {
        // Extraemos la parte numérica (incluyendo signo negativo o decimal)
        const numericPart = cleanValue.replace(/[^\d.-]/g, "");

        // Intentamos parsear
        const numberParsed = parseFloat(numericPart);
        if (!isNaN(numberParsed)) {
          // Multiplicamos por 1000
          const multiplied = numberParsed * 1000;
          // Construimos el nuevo string con " B"
          obj[key] = multiplied + " B";
        }
      }
    }
  }
  return obj;
}
/**
 * Aplica estilo de cabecera (fondo negro, texto blanco) a la fila `rowIndex`
 * en la hoja `ws`, para `numCols` columnas.
 */
function applyHeaderStyle(ws, rowIndex, numCols) {
  for (let c = 0; c < numCols; c++) {
    const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c });
    const cell = ws[cellAddress];
    if (!cell) continue; // podría estar vacío

    cell.s = {
      fill: {
        fgColor: { rgb: "000000" }, // Fondo negro
      },
      font: {
        name: "Arial",
        sz: 12,
        bold: true,
        color: { rgb: "FFFFFF" }, // Texto blanco
      },
      alignment: {
        horizontal: "center",
        vertical: "center",
      },
    };
  }
}

function parseWithSuffix(str) {
  if (!str || typeof str !== "string") return null;
  let cleaned = str.replace(/[^0-9.\-BM]/gi, "");
  if (!cleaned) return null;
  let multiplier = 1;
  const upper = cleaned.toUpperCase();
  if (upper.endsWith("B")) {
    multiplier = 1_000_000_000;
    cleaned = cleaned.slice(0, -1);
  } else if (upper.endsWith("M")) {
    multiplier = 1_000_000;
    cleaned = cleaned.slice(0, -1);
  }
  const val = parseFloat(cleaned);
  if (isNaN(val)) return null;
  return val * multiplier;
}
function calculateIntrinsicValues(financialData) {
  const metrics = financialData.metrics;
  const income = financialData.incomeStatement;
  const balance = financialData.balanceSheet;
  const cashFlow = financialData.cashFlow;

  return {
    "Benjamin Graham": {
      formula:
        "Intrinsic Value = EPS × (8.5 + 2g) × 4.4/Y\nWhere:\nEPS = Earnings per share\ng = Expected growth rate\nY = AAA Bond Yield (assumed 4.5%)",
      data: [
        `EPS (Earnings Per Share): $${metrics.EPS}`,
        `Growth Rate (g): ${metrics.fiveYearGrowthRates.netIncome}`,
        "AAA Corporate Bond Yield (Y): 4.5%",
        `Book Value per Share: $${balance["Book value per share"]["2023"]}`,
        `Total Assets (2023): ${balance["Total assets"]["2023"]}`,
        `Total Liabilities (2023): ${balance["Total liabilities"]["2023"]}`,
      ],
    },
    "Peter Lynch": {
      formula: "PEG = P/E / Growth Rate\nFair Value = PEG < 1",
      data: [
        `P/E Ratio: ${metrics.PE}`,
        `5-Year Revenue Growth Rate: ${metrics.fiveYearGrowthRates.revenue}`,
        `Current Stock Price: $${metrics.stockPrice}`,
        `Net Income Growth: ${metrics.fiveYearGrowthRates.netIncome}`,
        `EBITDA Growth: ${metrics.fiveYearGrowthRates.ebitda}`,
      ],
    },
    "Warren Buffett": {
      formula:
        "Owner Earnings = FCF × (1 + g)^n / (r - g)\nWhere:\nFCF = Free cash flow\ng = Sustainable growth rate\nr = Discount rate\nn = Projected years",
      data: [
        `Free Cash Flow (2023): ${cashFlow["Free cash flow"]["2023"]}`,
        `FCF Growth Rate: ${metrics.fiveYearGrowthRates.freeCashFlow}`,
        "Required Return (r): 12%",
        `EBIT (2023): ${income.EBIT["2023"]}`,
        `Total Debt (2023): ${balance["Total debt"]["2023"]}`,
        `Net Debt (2023): ${balance["Net debt"]["2023"]}`,
      ],
    },
    "Charlie Munger": {
      formula:
        "Margin of Safety = Intrinsic Value × 0.7\nBased on deep qualitative and quantitative analysis",
      data: [
        `Book Value per Share (2023): $${balance["Book value per share"]["2023"]}`,
        `Total Revenue (2023): ${income["Total revenue"]["2023"]}`,
        `Gross Profit (2023): ${income["Gross profit"]["2023"]}`,
        `Net Income (2023): ${income["Net income"]["2023"]}`,
        `EBITDA (2023): ${income.EBITDA["2023"]}`,
        `Total Equity (2023): ${balance["Total equity"]["2023"]}`,
      ],
    },
  };
}

function updateInvestorButtons(financialData) {
  try {
    const investorsData = calculateIntrinsicValues(financialData);

    // Remover la funcionalidad existente de todos los botones de información
    document.querySelectorAll(".solution-C9MdAMrq").forEach((button) => {
      // Clonar el botón para remover todos los event listeners existentes
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);

      // Remover las clases que puedan tener comportamientos por defecto
      newButton.classList.remove("apply-common-tooltip");
      newButton.removeAttribute("title");

      // Agregar la nueva funcionalidad
      newButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Encontrar el nombre del inversor
        const titleText = newButton
          .closest(".titleWrap-C9MdAMrq")
          .querySelector(".titleText-C9MdAMrq").textContent;

        showInvestorPopup(titleText, investorsData[titleText]);
      });
    });
  } catch (error) {
    console.error("Error updating investor buttons:", error);
  }
}
function showInvestorPopup(investorName, data) {
  const popupElement = document.createElement("div");
  popupElement.className = "investor-popup";
  popupElement.innerHTML = `
    <div class="popup-content">
      <div class="popup-header">
        <h3 class="popup-title">${investorName}'s Valuation Method</h3>
        <button class="close-button">×</button>
      </div>
      <div class="popup-body">
        <div class="formula-section">
          <h4>Formula Used:</h4>
          <p class="formula-text">${data.formula}</p>
        </div>
        <div class="data-section">
          <h4>Financial Data Used:</h4>
          <ul class="data-list">
            ${data.data.map((item) => `<li>${item}</li>`).join("")}
          </ul>
        </div>
      </div>
    </div>
  `;

  // Mantener el fondo oscuro original
  popupElement.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;

  // Estilos invertidos solo para el contenido del popup
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    .popup-content {
      background-color: #333;
      color: white;
      padding: 20px;
      border-radius: 8px;
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }
    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #666;
    }
    .popup-title {
      margin: 0;
      font-size: 1.5em;
      color: white;
    }
    .close-button {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #ccc;
      padding: 0 5px;
    }
    .close-button:hover {
      color: white;
    }
    .formula-text {
      background-color: #222;
      color: white;
      padding: 10px;
      border-radius: 4px;
      font-family: monospace;
      white-space: pre-wrap;
    }
    .data-list {
      list-style-type: none;
      padding: 0;
    }
    .data-list li {
      padding: 5px 0;
      border-bottom: 1px solid #666;
      color: white;
    }
    h4 {
      color: #ccc;
    }
  `;
  document.head.appendChild(styleSheet);

  // Añadir el popup al DOM
  document.body.appendChild(popupElement);

  // Funcionalidad para cerrar el popup
  const closeButton = popupElement.querySelector(".close-button");
  const closePopup = () => {
    document.body.removeChild(popupElement);
    document.head.removeChild(styleSheet);
  };

  closeButton.addEventListener("click", closePopup);
  popupElement.addEventListener("click", (e) => {
    if (e.target === popupElement) {
      closePopup();
    }
  });
}
// Los datos de los inversores
const investorsData = {
  "Benjamin Graham": {
    formula:
      "Valor intrínseco = EPS × (8.5 + 2g) × 4.4/Y\nDonde:\nEPS = Beneficio por acción\ng = Tasa de crecimiento esperada\nY = Rendimiento bonos AAA",
    data: [
      "EPS (Earnings Per Share): $2.45",
      "Growth Rate (g): 15%",
      "AAA Corporate Bond Yield (Y): 4.5%",
      "Book Value per Share: $18.75",
      "Current Assets: $1.2B",
      "Total Liabilities: $800M",
    ],
  },
  "Peter Lynch": {
    formula: "PEG = P/E / Growth Rate\nValor justo = PEG < 1",
    data: [
      "P/E Ratio: 18.5",
      "5-Year Earnings Growth Rate: 12%",
      "Current Price: $45.30",
      "Earnings Growth: 15%",
      "Dividend Yield: 2.8%",
    ],
  },
  "Warren Buffett": {
    formula:
      "Owner Earnings = FCF × (1 + g)^n / (r - g)\nDonde:\nFCF = Flujo de caja libre\ng = Tasa crecimiento sostenible\nr = Tasa de descuento\nn = Años proyectados",
    data: [
      "Free Cash Flow (FCF): $500M",
      "Growth Rate (g): 8%",
      "Required Return (r): 12%",
      "Projection Period (n): 10 years",
      "ROIC: 18%",
      "Debt/Equity: 0.45",
    ],
  },
  "Charlie Munger": {
    formula:
      "Margin of Safety = Valor intrínseco × 0.7\nBasado en análisis cualitativo y cuantitativo profundo",
    data: [
      "Calculated Intrinsic Value: $65.20",
      "Operating Margin: 22%",
      "Return on Equity: 19%",
      "Debt to Capital: 0.35",
      "Current Ratio: 2.1",
    ],
  },
};
function updateDOMWithInvestors(investorsData) {
  try {
    // Mapeo de filas originales a inversores
    const rowMapping = {
      "Cash from operating activities": "Benjamin Graham",
      "Cash from investing activities": "Peter Lynch",
      "Cash from financing activities": "Warren Buffett",
      "Free cash flow": "Charlie Munger",
    };

    // Función auxiliar para obtener el valor intrínseco
    function getIntrinsicValue(investorName) {
      const investor = investorsData.InvestingEquation.find(
        (inv) => inv[investorName]
      );
      return investor ? investor[investorName].intrensicValue : null;
    }

    // Iterar sobre cada mapeo y actualizar el DOM
    Object.entries(rowMapping).forEach(([originalText, investorName]) => {
      const titleTextElements = Array.from(
        document.querySelectorAll(".titleText-C9MdAMrq")
      ).filter((el) => el.textContent.trim() === originalText);

      titleTextElements.forEach((titleText) => {
        const titleWrap = titleText.closest(".titleWrap-C9MdAMrq");
        if (!titleWrap) return;

        // Cambiar el texto al nuevo nombre
        titleText.textContent = investorName;

        // Actualizar enlace y tooltip si existe
        const link = titleWrap.querySelector(".indicatorPageLink-RSR_Hp1S");
        if (link) {
          link.title = `${investorName} intrinsic value calculation`;
          link.href = `/investors/${investorName
            .toLowerCase()
            .replace(" ", "-")}/`;
        }

        // Encontrar la fila (div) con data-name
        const row = titleWrap.closest("[data-name]");
        if (row) {
          // Ajustar el atributo data-name
          row.setAttribute("data-name", investorName);

          // Eliminar algún elemento extra si fuera necesario
          const buttonWrap = row.querySelector(
            ".buttonWrap-C9MdAMrq.hasChanges-C9MdAMrq"
          );
          if (buttonWrap) {
            buttonWrap.remove();
          }
          const arrowSpan = row.querySelector(
            "span.arrow-C9MdAMrq.hasChanges-C9MdAMrq"
          );
          if (arrowSpan) {
            arrowSpan.remove();
          }

          // Reemplazar el botón con el valor intrínseco
          const valueContainers = row.querySelectorAll(
            ".container-OxVAcLqi.alignLeft-OxVAcLqi.legacy-mode-OxVAcLqi"
          );
          valueContainers.forEach((container) => {
            const button = container.querySelector("button");
            if (button) {
              const intrinsicValue = getIntrinsicValue(investorName);
              const intrinsicDiv = document.createElement("div");
              intrinsicDiv.style.display = "flex";
              intrinsicDiv.style.flexDirection = "column";
              intrinsicDiv.style.gap = "4px";
              intrinsicDiv.style.alignItems = "center";

              const span = document.createElement("span");
              span.textContent = intrinsicValue
                ? `$${intrinsicValue.toFixed(2)}`
                : "N/A";

              const span2 = document.createElement("span");
              const percentageDiff = calculatePercentageDifference(
                intrinsicValue,
                financialData.metrics.stockPrice
              );
              span2.textContent = percentageDiff;
              span2.style.fontSize = "12px";

              // Add conditional classes based on the percentage value
              if (percentageDiff !== "N/A") {
                if (percentageDiff.includes("+")) {
                  span2.className = "change-OxVAcLqi positive-OxVAcLqi";
                } else if (percentageDiff.startsWith("%")) {
                  span2.className = "change-OxVAcLqi negative-OxVAcLqi";
                }
              }

              intrinsicDiv.appendChild(span);
              intrinsicDiv.appendChild(span2);

              container.replaceChild(intrinsicDiv, button);
            }
          });
        }
      });
    });

    // Actualizar el título de la moneda
    const currencyElement = document.querySelector(
      ".js-symbol-currency.currency-JWoJqCpY"
    );
    if (currencyElement) {
      currencyElement.textContent = "Super Investors intrinsic values";
    }

    // Ocultar scrollbar overlay
    const overlayScroll = document.querySelector(".overlayScrollWrap-Tv7LSjUz");
    if (overlayScroll) {
      overlayScroll.style.display = "none";
    }

    // Ahora hacemos click en cada uno de los divs data-name que generamos.
    // Usamos los nuevos nombres de inversor como referencia.
    const investorNames = Object.values(rowMapping);
    investorNames.forEach((invName) => {
      const rowElement = document.querySelector(`[data-name="${invName}"]`);
      if (rowElement) {
        rowElement.click();
      }
    });
    const firstColumnDivs = document.querySelectorAll(
      "div.firstColumn-OWKkVLyj"
    );
    firstColumnDivs.forEach((div) => {
      div.textContent = "Super investors";
    });
  } catch (error) {
    console.error("Error updating DOM with investors data:", error);
  }
}

function removeRowsAndColumns() {
  // 1) Seleccionamos el "wrapper" principal
  // Seleccionas el contenedor que tiene todo
  const container = document.querySelector(".values-OWKkVLyj");

  // Si existe, buscamos todos los .value-OxVAcLqi y .subvalue-OxVAcLqi que estén dentro
  if (container) {
    // Seleccionamos ambos tipos de elementos
    const elems = container.querySelectorAll(
      ".value-OxVAcLqi, .subvalue-OxVAcLqi"
    );

    elems.forEach((el) => {
      // Para borrar su texto, basta con vaciar textContent
      el.textContent = "";
    });
  }

  const wrapper = document.querySelector(".wrapper-Tv7LSjUz");
  if (!wrapper) {
    console.warn("No se encontró .wrapper-Tv7LSjUz");
    return;
  }

  // 2) Definimos qué data-name queremos conservar
  const keepDataNames = [
    "Cash from operating activities",
    "Cash from investing activities",
    "Cash from financing activities",
    "Free cash flow",
  ];

  // 3) Buscamos todos los rows y eliminamos los que no están en keepDataNames
  const allRows = wrapper.querySelectorAll(".container-C9MdAMrq");
  allRows.forEach((row) => {
    const dataName = row.getAttribute("data-name");
    // Si NO está dentro de keepDataNames, lo quitamos
    if (!keepDataNames.includes(dataName)) {
      row.remove();
    }
  });

  // 4) Para los rows que sí se quedan, eliminamos todas las columnas excepto la 1a
  const remainingRows = wrapper.querySelectorAll(".container-C9MdAMrq");
  remainingRows.forEach((row) => {
    const colDivs = row.querySelectorAll(".container-OxVAcLqi");
    colDivs.forEach((col, idx) => {
      // si idx > 0 => lo borramos
      if (idx > 0) {
        col.remove();
      }
    });
  });
}

// -------------------------------------------------------------------------
// Ajustado para contemplar B y M en calcAllIntrinsicValues y calculateFiveYearGrowthRates
// -------------------------------------------------------------------------
function calcAllIntrinsicValues(report) {
  const result = { InvestingEquation: [] };

  function toNumber(str) {
    if (!str) return null;
    const numeric = parseWithSuffix(str);
    return numeric !== null ? numeric : null;
  }

  const stockPrice = toNumber(report.metrics?.stockPrice);
  const pe = toNumber(report.metrics?.PE);
  const eps = toNumber(report.metrics?.EPS);

  function parseGrowthRate(str) {
    if (!str) return null;
    const num = parseFloat(str.replace(/[^0-9.\-]+/g, ""));
    if (isNaN(num)) return null;
    return num / 100;
  }

  const revenueGrowth = parseGrowthRate(
    report.metrics?.fiveYearGrowthRates?.revenue
  );
  const netIncomeGrowth = parseGrowthRate(
    report.metrics?.fiveYearGrowthRates?.netIncome
  );
  const ebitdaGrowth = parseGrowthRate(
    report.metrics?.fiveYearGrowthRates?.ebitda
  );
  const fcfGrowth = parseGrowthRate(
    report.metrics?.fiveYearGrowthRates?.freeCashFlow
  );

  (function benjaminGraham() {
    const investorName = "Benjamin Graham";
    let missingData = [];
    let intrensicValue = null;

    if (!eps) missingData.push("EPS");
    if (netIncomeGrowth == null)
      missingData.push("5y net income growth (para g)");

    if (missingData.length === 0) {
      const g = netIncomeGrowth;
      intrensicValue = eps * (8.5 + 2 * (g * 100));
    }

    result.InvestingEquation.push({
      [investorName]: { intrensicValue, missingData },
    });
  })();

  (function peterLynch() {
    const investorName = "Peter Lynch";
    let missingData = [];
    let intrensicValue = null;

    if (!eps) missingData.push("EPS");
    if (netIncomeGrowth == null) missingData.push("5y net income growth");

    if (missingData.length === 0) {
      const g = netIncomeGrowth;
      intrensicValue = eps * (g * 100);
    }

    result.InvestingEquation.push({
      [investorName]: { intrensicValue, missingData },
    });
  })();

  (function warrenBuffett() {
    const investorName = "Warren Buffett";
    let missingData = [];
    let intrensicValue = null;

    function parseWithSuffix(str) {
      if (!str) return null;
      const cleanStr = str.replace(/[,‪‬]/g, "");
      const num = parseFloat(cleanStr.replace(/[^0-9.\-]+/g, ""));
      const suffix = cleanStr.match(/[A-Za-z]+$/)?.[0]?.toUpperCase();

      switch (suffix) {
        case "B":
          return num * 1000000000;
        case "M":
          return num * 1000000;
        case "K":
          return num * 1000;
        default:
          return num;
      }
    }

    // Obtener FCF y convertir a valor por acción
    const latestFCFStr = report.cashFlow?.["Free cash flow"]?.["2024"];
    console.log;

    const fcfNum = parseWithSuffix(latestFCFStr);

    // Estimamos el número de acciones basado en el EPS y Net Income
    const eps = parseFloat(report.metrics.EPS);

    const netIncome2024 = parseWithSuffix(
      report.incomeStatement?.["Net income"]?.["2024"]
    );

    const estimatedShares = netIncome2024 / eps;

    // Convertir FCF a valor por acción
    const fcfPerShare = fcfNum / estimatedShares;

    // Calcular crecimiento histórico
    const fcf2019Str = report.cashFlow?.["Free cash flow"]?.["2019"];

    const fcf2019 = parseWithSuffix(fcf2019Str);

    const fcf2019PerShare = fcf2019 / estimatedShares;

    const years = 2024 - 2019;
    const fcfGrowth =
      ((fcfPerShare / fcf2019PerShare) ** (1 / years) - 1) * 100;

    // Validaciones
    if (!fcfNum) missingData.push("Free cash flow actual");
    if (!fcfGrowth) missingData.push("Histórico de Free cash flow");
    if (!eps) missingData.push("EPS");

    // Log missing data

    if (missingData.length === 0) {
      // Usar una tasa de crecimiento más conservadora
      const growthRate = Math.min(fcfGrowth, 12); // Cap at 12%

      const discountRate = 0.12; // Aumentamos la tasa de descuento

      const projectionPeriod = 10;
      const terminalGrowthRate = 0.02;

      let presentValue = 0;
      let currentFCF = fcfPerShare;

      // Calcular valor presente de flujos futuros
      for (let i = 1; i <= projectionPeriod; i++) {
        currentFCF *= 1 + growthRate / 100;
        const discounted = currentFCF / Math.pow(1 + discountRate, i);
        presentValue += discounted;

        // Log future and discounted values for each year
      }

      // Calcular valor terminal
      const terminalValue =
        (currentFCF * (1 + terminalGrowthRate)) /
        (discountRate - terminalGrowthRate);

      const presentTerminalValue =
        terminalValue / Math.pow(1 + discountRate, projectionPeriod);

      // Valor intrínseco total con margen de seguridad del 30%
      intrensicValue = (presentValue + presentTerminalValue) * 0.7;
    }

    result.InvestingEquation.push({
      [investorName]: {
        intrensicValue,
        missingData,
      },
    });
  })();
  (function charlieMunger() {
    const investorName = "Charlie Munger";
    let missingData = [];
    let intrensicValue = null;

    if (!pe) missingData.push("PE");
    if (!eps) missingData.push("EPS");

    if (missingData.length === 0) {
      intrensicValue = pe * eps;
    }

    result.InvestingEquation.push({
      [investorName]: { intrensicValue, missingData },
    });
  })();

  return result;
}
function calculateFiveYearGrowthRates(financialData) {
  function cleanNumber(str) {
    if (!str || str === "N/A") return null;
    return parseWithSuffix(str);
  }

  function calculateCAGR(initialValue, finalValue, years) {
    if (!initialValue || !finalValue || initialValue <= 0) return null;
    return (
      ((Math.pow(finalValue / initialValue, 1 / years) - 1) * 100).toFixed(2) +
      "%"
    );
  }

  const growthRates = {
    revenue: calculateCAGR(
      cleanNumber(
        financialData.incomeStatement?.["Total revenue"]?.["2018"] ?? 0
      ),
      cleanNumber(
        financialData.incomeStatement?.["Total revenue"]?.["2023"] ?? 0
      ),
      5
    ),
    netIncome: calculateCAGR(
      cleanNumber(financialData.incomeStatement?.["Net income"]?.["2018"] ?? 0),
      cleanNumber(financialData.incomeStatement?.["Net income"]?.["2023"] ?? 0),
      5
    ),
    ebitda: calculateCAGR(
      cleanNumber(financialData.incomeStatement?.["EBITDA"]?.["2018"] ?? 0),
      cleanNumber(financialData.incomeStatement?.["EBITDA"]?.["2023"] ?? 0),
      5
    ),
    freeCashFlow: calculateCAGR(
      cleanNumber(financialData.cashFlow?.["Free cash flow"]?.["2018"] ?? 0),
      cleanNumber(financialData.cashFlow?.["Free cash flow"]?.["2023"] ?? 0),
      5
    ),
  };

  financialData.metrics.fiveYearGrowthRates = growthRates;
  return growthRates;
}

function extractProcessedYears() {
  // Obtener todos los elementos de año del DOM
  const yearElements = document.querySelectorAll(
    ".values-OWKkVLyj.values-AtxjAQkN > div > div"
  );
  const yearStrings = Array.from(yearElements).map((el) =>
    el.textContent.trim()
  );

  let maxYear = null;

  // Encontrar el año máximo numérico
  for (const str of yearStrings) {
    if (str !== "TTM") {
      const year = parseInt(str, 10);
      if (!isNaN(year) && (maxYear === null || year > maxYear)) {
        maxYear = year;
      }
    }
  }

  if (maxYear === null) {
    console.error("No se encontraron años válidos en el componente.");
    return [];
  }

  // Determinar el año más reciente (incluyendo TTM convertido)
  const hasTTM = yearStrings.includes("TTM");
  const latestYear = hasTTM ? maxYear + 1 : maxYear;

  // Calcular el año de inicio (8 años hacia atrás desde el más reciente)
  const startYear = latestYear - 7; // 8 años incluyendo latestYear

  // Generar el array de años desde startYear hasta latestYear
  const years = [];
  for (let year = startYear; year <= latestYear; year++) {
    years.push(year);
  }

  return years;
}

function obtenerValoresFilaBalance(dataName) {
  const row = document.querySelector(`[data-name="${dataName}"]`);
  if (!row) {
    console.warn(`No se encontró la fila de "${dataName}"`);
    return null; // o un objeto con "N/A"
  }
  const valueContainers = row.querySelectorAll(
    ".values-C9MdAMrq .container-OxVAcLqi.legacy-mode-OxVAcLqi .wrap-OxVAcLqi .value-OxVAcLqi"
  );
  const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const dataObj = {};

  years.forEach((year, index) => {
    const container = valueContainers[index];
    dataObj[year] = container ? container.textContent.trim() : "N/A";
  });

  return dataObj;
}

function calculatePercentageDifference(intrinsicValue, stockPrice) {
  if (!intrinsicValue || !stockPrice) return "N/A";

  // Convert stockPrice from string to number if needed
  const stockPriceNum =
    typeof stockPrice === "string"
      ? parseFloat(stockPrice.replace(/[^0-9.-]+/g, ""))
      : stockPrice;

  // Calculate percentage difference
  const difference = ((intrinsicValue - stockPriceNum) / stockPriceNum) * 100;

  // Return formatted string with percentage
  return difference > 0
    ? `+%${difference.toFixed(2)}`
    : `%${difference.toFixed(2)}`;
}

(function () {
  console.log("SE EJECUTA ESTO----");

  // ----------------------------------
  // Función para clonar/inyectar el botón invertido
  // ----------------------------------
  function addInvertedRevenueBtn() {
    // Evitamos duplicar el botón si ya existe
    const yaExiste = document.getElementById("revenue-inverted");
    if (yaExiste) return yaExiste;

    // 1. Localizamos el botón original con id="revenue"
    const originalRevenueBtn = document.getElementById("revenue");
    if (!originalRevenueBtn) return null;

    // 2. Creamos una copia/clon de ese botón (tipo <a>)
    const invertedRevenueBtn = originalRevenueBtn.cloneNode(true);
    invertedRevenueBtn.removeAttribute("href");
    // 3. Cambiamos su id para evitar duplicados
    invertedRevenueBtn.id = "revenue-inverted";

    // 4. Invertimos los colores (ejemplo: fondo claro, texto oscuro)
    invertedRevenueBtn.style.backgroundColor = "#EABE3F";
    invertedRevenueBtn.style.color = "#000";

    // 5. Opcional: cambiar el texto interno
    const spanInside = invertedRevenueBtn.querySelector("span");
    if (spanInside) {
      spanInside.textContent = "Super investors";
    }

    // 6. Insertamos la copia dentro del contenedor <div id="financials-tabs">
    const financialsTabsDiv = document.getElementById("financials-tabs");
    if (!financialsTabsDiv) return null;

    financialsTabsDiv.appendChild(invertedRevenueBtn);
    return invertedRevenueBtn;
  }

  // ----------------------------------
  // Insertamos el botón invertido (al menos la primera vez).
  // ----------------------------------
  let invertedRevenueBtn = addInvertedRevenueBtn();

  // ----------------------------------
  // Creamos el modal y su fondo
  // ----------------------------------
  const modalBackground = document.createElement("div");
  modalBackground.id = "mi-modal-extension";
  modalBackground.style.display = "none";
  modalBackground.style.position = "fixed";
  modalBackground.style.top = "0";
  modalBackground.style.left = "0";
  modalBackground.style.width = "100%";
  modalBackground.style.height = "100%";
  modalBackground.style.zIndex = "100000";

  const modalContent = document.createElement("div");
  modalContent.style.backgroundColor = "#fff";
  modalContent.style.margin = "10% auto";
  modalContent.style.padding = "20px";
  modalContent.style.width = "50%";
  modalContent.style.borderRadius = "8px";

  const modalText = document.createElement("p");
  modalText.innerText = "Texto de ejemplo del modal";

  const closeModalButton = document.createElement("button");
  closeModalButton.innerText = "Cerrar";
  closeModalButton.style.marginTop = "20px";

  closeModalButton.onclick = function () {
    modalBackground.style.display = "none";
    ocultarOverlayBlur();
  };

  modalContent.appendChild(modalText);
  modalContent.appendChild(closeModalButton);
  modalBackground.appendChild(modalContent);
  document.body.appendChild(modalBackground);

  // ----------------------------------
  // Función para obtener texto de la página (ejemplo)
  // ----------------------------------
  function obtenerTextoDeLaPagina() {
    const titulo = document.querySelector("h1");
    return titulo ? titulo.innerText : "No se encontró un <h1>";
  }

  // ----------------------------------
  // Overlay blur
  // ----------------------------------
  let overlayBlur = null;

  function mostrarOverlayBlur() {
    if (overlayBlur) return;
    overlayBlur = document.createElement("div");
    overlayBlur.style.position = "fixed";
    overlayBlur.style.top = "0";
    overlayBlur.style.left = "0";
    overlayBlur.style.width = "100vw";
    overlayBlur.style.height = "100vh";
    overlayBlur.style.zIndex = "99999";
    overlayBlur.style.backdropFilter = "blur(8px)";
    overlayBlur.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
    overlayBlur.style.pointerEvents = "auto";
    document.body.appendChild(overlayBlur);
  }

  function ocultarOverlayBlur() {
    if (!overlayBlur) return;
    document.body.removeChild(overlayBlur);
    overlayBlur = null;
  }

  // ----------------------------------
  // Asignar evento al botón invertido (si existe)
  // ----------------------------------
  function attachInvertedRevenueBtnListener(btn) {
    if (!btn) return;
    btn.addEventListener("click", async (evt) => {
      evt.preventDefault();
      try {
        // Create an object to store all the data
        financialData = {
          metrics: {},
          incomeStatement: {},
          balanceSheet: {},
          cashFlow: {},
          stock: {},
        };

        const overviewLink = document.getElementById("overview");
        if (overviewLink) {
          overviewLink.click();

          const stockPriceElement = document.querySelector(
            "span.last-JWoJqCpY.js-symbol-last"
          );
          const currencyElement = document.querySelector(
            "span.js-symbol-currency.currency-JWoJqCpY"
          );

          const stockNameElement = document.querySelector("span.item-JLr4OyLc");

          if (stockPriceElement) {
            financialData.metrics.stockPrice =
              stockPriceElement.textContent.trim();
          }
          if (currencyElement) {
            financialData.metrics.currency = currencyElement.textContent.trim();
          }

          if (stockNameElement) {
            financialData.stock = stockNameElement.textContent.trim();
          }

          const items = document.querySelectorAll("div.item-D38HaCsG");
          if (items.length >= 4) {
            const thirdDiv = items[2];
            const fourthDiv = items[3];
            const thirdSpans = thirdDiv.querySelectorAll("span");
            const fourthSpans = fourthDiv.querySelectorAll("span");

            if (thirdSpans.length >= 2) {
              financialData.metrics.PE = thirdSpans[5].textContent.trim();
            }
            if (fourthSpans.length >= 2) {
              financialData.metrics.EPS = fourthSpans[5].textContent.trim();
            }
          }
        }

        const statementsLink = document.getElementById("statements");
        if (statementsLink) {
          statementsLink.click();
          const anualButton = document.getElementById("FY");
          if (anualButton) {
            anualButton.click();
          }
        } else {
          return;
        }

        mostrarOverlayBlur();
        modalText.innerText = obtenerTextoDeLaPagina();

        // Income Statement Data Collection

        // Estos años hay que obtenerlos desde el componente <html> que adjunte,
        // desde este class div "values-OWKkVLyj values-AtxjAQkN"
        // dentro cada div hay un div y otro div adentro con el valor texto por ejemplo 2023, o TTM
        // crea un algoritmo para obtener ese año desde el TTM transformandolo en el anterior + 1
        // por ejemplo 2023 + 1 seria el valor real de TTM. desde ese año osea 2024 anda 8 años atras
        // si existe el valor seria hasta 2017

        const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

        const incomeMetrics = [
          "Total revenue",
          "Gross profit",
          "Net income",
          "EBITDA",
          "EBIT",
        ];

        for (const metric of incomeMetrics) {
          const row = document.querySelector(`[data-name="${metric}"]`);
          if (row) {
            const valueContainers = row.querySelectorAll(
              ".values-C9MdAMrq .container-OxVAcLqi.legacy-mode-OxVAcLqi .wrap-OxVAcLqi .value-OxVAcLqi"
            );
            const metricData = {};

            years.forEach((year, index) => {
              const container = valueContainers[index];
              metricData[year] = container
                ? container.textContent.trim()
                : "N/A";
            });

            financialData.incomeStatement[metric] = metricData;
          }
        }

        // Balance Sheet Data Collection
        const balanceSheetLink = document.getElementById("balance sheet");
        if (balanceSheetLink) {
          balanceSheetLink.click();

          await new Promise((resolve) => setTimeout(resolve, 666));

          const balanceMetrics = [
            "Total assets",
            "Total liabilities",
            "Total equity",
            "Total debt",
            "Net debt",
            "Book value per share",
          ];

          for (const metric of balanceMetrics) {
            const data = obtenerValoresFilaBalance(metric);
            if (data) {
              financialData.balanceSheet[metric] = data;
            }
          }

          // Cash Flow Data Collection
          const cashFlowLink = document.getElementById("cash flow");
          if (cashFlowLink) {
            cashFlowLink.click();

            await new Promise((resolve) => setTimeout(resolve, 666));

            const cashFlowData = obtenerValoresFilaBalance("Free cash flow");
            if (cashFlowData) {
              financialData.cashFlow["Free cash flow"] = cashFlowData;
            }

            // UI Updates
            const titleH1 = document.querySelector("h1.title-hegngCX6");
            if (titleH1) {
              titleH1.textContent =
                "Section showing valuation methods of top super investors";
            }

            const descP = document.querySelector(
              "p.description-hegngCX6.collapsed-hegngCX6"
            );
            if (descP) {
              descP.textContent =
                "Displaying valuation equations from renowned investors.";
            }

            const chartContainer = document.querySelector(
              "div.chartContainer-MJytD_Lf"
            );
            if (chartContainer) {
              chartContainer.style.display = "none";
            }

            const adaptiveRow = document.querySelector(
              "div.adaptiveRow-EZAm5mou"
            );
            if (adaptiveRow) {
              adaptiveRow.style.display = "none";
            }

            ocultarOverlayBlur();
          }
        }
        calculateFiveYearGrowthRates(financialData);

        intrensicValues = calcAllIntrinsicValues(financialData);
        // FOR STYLING ONLY OLD WAY
        // removeRowsAndColumns();

        // updateDOMWithInvestors(intrensicValues);
        // updateInvestorButtons(financialData);

        financialData = transformBValues(financialData);
        console.log("FINANCIAL DATA", financialData);
        try {
          // Enviar mensaje al background script
          const response = await chrome.runtime.sendMessage({
            action: "createSheet",
            sheetName: "Stock performance resume",
            data: financialData,
          });

          if (response.success) {
            // Abrir el Sheet creado
            window.open(response.sheetUrl, "_blank");
          } else {
            console.error("Error:", response.error);
          }
        } catch (error) {
          console.error("Error de comunicación:", error);
        }
        // TODO: Agregar aca el boton
        // generateExcelAndDownload(financialData, XLSX);

        // generateExcelAndDownload(financialData);
        // const targetElement = document.querySelector(
        //   "div.lastContainer-JWoJqCpY"
        // );

        // // Si lo encontramos, usamos scrollIntoView para desplazar la vista hasta él
        // if (targetElement) {
        //   targetElement.scrollIntoView({
        //     behavior: "smooth",
        //     block: "center",
        //   });
        // }

        console.log("intrensicValues", intrensicValues);
        // Log the entire collected data at the end
        console.log("Financial Data:", financialData);
      } catch (e) {
        console.log(e.stack);
      }
    });
  }

  // Adjuntamos el evento inicialmente
  attachInvertedRevenueBtnListener(invertedRevenueBtn);

  // ----------------------------------
  //  MUTATION OBSERVER
  //  Para re-insertar el botón si desaparece
  // ----------------------------------
  const financialsTabsDiv = document.getElementById("financials-tabs");
  if (financialsTabsDiv) {
    const observer = new MutationObserver(() => {
      // Chequeamos si el botón invertido sigue en el DOM
      const btnStillThere = document.getElementById("revenue-inverted");
      if (!btnStillThere) {
        // Lo reinsertamos y le volvemos a adjuntar el evento
        const newBtn = addInvertedRevenueBtn();
        attachInvertedRevenueBtnListener(newBtn);
      }
    });

    observer.observe(financialsTabsDiv, {
      childList: true,
      subtree: true,
    });
  }
})();
