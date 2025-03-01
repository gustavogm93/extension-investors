chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "createSheet") {
    createSheet(request.data);
  }
  return true;
});

async function createSheet(financialData) {
  try {
    console.log("Starting to create sheet with data:", financialData);
    const token = await getToken();
    console.log("Authentication token obtained");

    // Create a spreadsheet with the stock name as part of the title
    const sheetTitle = `${financialData.stock} - Financial Resume`;
    console.log("Creating spreadsheet with title:", sheetTitle);
    const spreadsheet = await createGoogleSheet(token, sheetTitle);
    const spreadsheetId = spreadsheet.spreadsheetId;
    console.log("Created spreadsheet with ID:", spreadsheetId);

    // Get the default sheet ID to update it
    const defaultSheetId = spreadsheet.sheets[0].properties.sheetId;
    console.log("Default sheet ID:", defaultSheetId);

    // Create a sheet for each financial segment
    const segments = ["incomeStatement", "balanceSheet", "cashFlow"];
    const sheetIds = {};

    // Rename the first sheet to "Overview"
    console.log("Renaming default sheet to 'Overview'");
    await renameSheet(token, spreadsheetId, defaultSheetId, "Overview");
    sheetIds["Overview"] = defaultSheetId;

    // Create other sheets
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] !== "Overview") {
        const segmentName = formatSegmentName(segments[i]);
        console.log(`Creating sheet for segment: ${segmentName}`);
        const sheetId = await addSheet(token, spreadsheetId, segmentName);
        sheetIds[segmentName] = sheetId;
        console.log(
          `Created sheet with ID ${sheetId} for segment ${segmentName}`
        );
      }
    }

    // Populate the Overview sheet
    console.log("Populating Overview sheet");
    await populateOverviewSheet(
      token,
      spreadsheetId,
      sheetIds["Overview"],
      financialData,
      false
    );

    // Populate each segment sheet with data and charts
    for (const segment of segments) {
      const segmentName = formatSegmentName(segment);
      if (segmentName !== "Overview" && financialData[segment]) {
        console.log(`Populating segment sheet: ${segmentName}`);
        // Only create charts for balanceSheet, cashFlow, and incomeStatement
        const createCharts = [
          "balanceSheet",
          "cashFlow",
          "incomeStatement",
        ].includes(segment);
        console.log(
          `Will ${createCharts ? "create" : "skip"} charts for ${segmentName}`
        );
        await populateSegmentSheet(
          token,
          spreadsheetId,
          sheetIds[segmentName],
          segment,
          financialData[segment],
          createCharts
        );
      }
    }

    // Open the created spreadsheet
    console.log("Opening spreadsheet in new tab");
    chrome.tabs.create({
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    });
  } catch (error) {
    console.error("Error creating spreadsheet:", error);
  }
}

function getToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      token ? resolve(token) : reject(new Error("Error de autenticación"));
    });
  });
}

async function createGoogleSheet(token, title) {
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
          title: title,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to create sheet: ${response.statusText}`);
  }

  return await response.json();
}

async function renameSheet(token, spreadsheetId, sheetId, newName) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId: sheetId,
                title: newName,
              },
              fields: "title",
            },
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to rename sheet: ${response.statusText}`);
  }

  return await response.json();
}

async function addSheet(token, spreadsheetId, sheetName) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName,
              },
            },
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to add sheet: ${response.statusText}`);
  }

  const result = await response.json();
  return result.replies[0].addSheet.properties.sheetId;
}

async function populateOverviewSheet(
  token,
  spreadsheetId,
  sheetId,
  financialData,
  createCharts = false
) {
  const { metrics, stock } = financialData;

  console.log("Populating overview sheet with stock data");

  // Format overview data
  const overviewData = [
    ["Stock Summary", `${stock}`],
    ["Stock Price", metrics.stockPrice],
    ["Currency", metrics.currency],
    ["P/E Ratio", metrics.PE],
    ["EPS", metrics.EPS],
    ["", ""],
    ["5-Year Growth Rates", ""],
    ["Revenue", metrics.fiveYearGrowthRates.revenue],
    ["Net Income", metrics.fiveYearGrowthRates.netIncome],
    ["EBITDA", metrics.fiveYearGrowthRates.ebitda],
    ["Free Cash Flow", metrics.fiveYearGrowthRates.freeCashFlow],
  ];

  // Update values
  await updateValues(token, spreadsheetId, "Overview!A1", overviewData);

  // Apply formatting
  await applyFormatting(token, spreadsheetId, sheetId, {
    headerRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 2 },
    subheaderRange: { startRow: 6, endRow: 7, startCol: 0, endCol: 1 },
  });

  // No charts for metrics as requested
  console.log("Skipping chart creation for metrics as requested");
}

async function populateSegmentSheet(
  token,
  spreadsheetId,
  sheetId,
  segmentKey,
  segmentData,
  createCharts = true
) {
  console.log(
    `Starting populateSegmentSheet for ${segmentKey}, createCharts=${createCharts}`
  );

  // Get years and items
  const items = Object.keys(segmentData);
  console.log(`Found ${items.length} items in segment ${segmentKey}:`, items);

  let years = [];

  if (items.length > 0 && segmentData[items[0]]) {
    years = Object.keys(segmentData[items[0]])
      .filter(
        (year) =>
          segmentData[items[0]][year] !== "N/A" && !isNaN(parseInt(year))
      )
      .sort();
    console.log(
      `Found ${years.length} years for segment ${segmentKey}:`,
      years
    );
  }

  if (years.length === 0) {
    console.error(`No valid years found for segment ${segmentKey}`);
    return;
  }

  // Determine if values are in billions or millions
  let valueUnit = "Values in Billions (USD)";
  if (items.length > 0 && years.length > 0) {
    const sampleValue = segmentData[items[0]][years[0]];
    if (typeof sampleValue === "string" && sampleValue.includes("M")) {
      valueUnit = "Values in Millions (USD)";
    }
  }

  // Create header row - Change "Item" to "Year" as requested
  const headerRow = ["Year", ...years];

  // Add the unit info as a subtitle
  const unitInfoRow = [valueUnit, ...Array(years.length).fill("")];

  // Create data rows with both displayValue and actualValue for charts
  const dataRows = [];
  const numericMatrix = {}; // For creating the chart data later

  // For each item (e.g., "Total revenue")
  console.log(`Processing data for each item in segment ${segmentKey}`);
  items.forEach((item) => {
    const row = [item];
    numericMatrix[item] = {};

    // For each year (e.g., "2017", "2018", etc.)
    for (const year of years) {
      // Get the original value
      let value = segmentData[item][year];

      // Skip N/A values
      if (value === "N/A") {
        row.push("");
        numericMatrix[item][year] = null;
        continue;
      }

      // Process the value for display in the sheet
      if (typeof value === "string") {
        // Log original value for debugging
        console.log(`Processing value for ${item}, ${year}: "${value}"`);

        // Handle negative values with special character
        if (value.includes("−")) {
          value = value.replace("−", "-");
          console.log(`  Replaced negative sign: "${value}"`);
        }

        let numericValue = null;

        // Extract numeric value for billions (B)
        if (value.includes("B")) {
          // Extract just the number and convert to a numeric value in billions
          numericValue = parseFloat(value.replace(/[^0-9.-]/g, ""));
          console.log(`  Parsed as billions: ${numericValue}`);

          // For sheets, we'll use a formatted text that Google Sheets can parse
          row.push(numericValue);
        } else if (value.includes("%")) {
          // Handle percentage values
          numericValue = parseFloat(value.replace(/[^0-9.-]/g, "")) / 100;
          console.log(`  Parsed as percentage: ${numericValue}`);
          row.push(numericValue);
        } else {
          // For other string values, try to extract numeric content
          const cleanValue = value.replace(/[^0-9.-]/g, "");
          if (cleanValue && !isNaN(parseFloat(cleanValue))) {
            numericValue = parseFloat(cleanValue);
            console.log(`  Parsed as number: ${numericValue}`);
            row.push(numericValue);
          } else {
            console.log(`  Keeping as string: "${value}"`);
            row.push(value);
            numericValue = null;
          }
        }

        // Store the numeric value for chart creation
        numericMatrix[item][year] = numericValue;
      } else {
        console.log(
          `Value for ${item}, ${year} is already a non-string: ${value}`
        );
        row.push(value);
        numericMatrix[item][year] = value;
      }
    }

    dataRows.push(row);
  });

  // Combine header row, unit info row, and data rows
  const sheetData = [headerRow, unitInfoRow, ...dataRows];

  // Set range for update (e.g., "Sheet1!A1")
  const range = `${formatSegmentName(segmentKey)}!A1`;

  // Update values
  await updateValues(token, spreadsheetId, range, sheetData);

  async function applyFormatting(token, spreadsheetId, sheetId, ranges) {
    const requests = [];

    // Format header row with bold text and background color - manteniendo el estilo original
    if (ranges.headerRange) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: ranges.headerRange.startRow,
            endRowIndex: ranges.headerRange.endRow,
            startColumnIndex: ranges.headerRange.startCol,
            endColumnIndex: ranges.headerRange.endCol,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: {
                red: 0.2,
                green: 0.2,
                blue: 0.6,
                alpha: 1.0,
              },
              textFormat: {
                foregroundColor: {
                  red: 1.0,
                  green: 1.0,
                  blue: 1.0,
                },
                bold: true,
                fontSize: 12,
              },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      });
    }

    // Format subheaders if specified
    if (ranges.subheaderRange) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: ranges.subheaderRange.startRow,
            endRowIndex: ranges.subheaderRange.endRow,
            startColumnIndex: ranges.subheaderRange.startCol,
            endColumnIndex: ranges.subheaderRange.endCol,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: {
                red: 0.8,
                green: 0.8,
                blue: 0.8,
                alpha: 1.0,
              },
              textFormat: {
                bold: true,
                italic: true,
              },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      });
    }

    // Hacer la columna B (índice 1) más ancha que las otras columnas
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: "COLUMNS",
          startIndex: 1, // Columna B (índice 0 es columna A)
          endIndex: 2, // Solo columna B
        },
        properties: {
          pixelSize: 250, // Ancho en píxeles (ajusta según necesites)
        },
        fields: "pixelSize",
      },
    });

    // Auto-resize otras columnas
    requests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId: sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: 1, // Columna A
        },
      },
    });

    // Auto-resize columnas después de B
    requests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId: sheetId,
          dimension: "COLUMNS",
          startIndex: 2, // Desde columna C en adelante
          endIndex: 15,
        },
      },
    });

    // Apply the formatting
    if (requests.length > 0) {
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: requests,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to apply formatting: ${response.statusText}`);
      }

      return await response.json();
    }
  }

  // Apply number formatting
  const numberFormatRequests = [];

  // For each data cell that contains a number, apply appropriate formatting
  for (let i = 0; i < dataRows.length; i++) {
    for (let j = 1; j < headerRow.length; j++) {
      // Skip the first column (item names)
      // Get the value from our matrix
      const item = items[i];
      const year = years[j - 1]; // -1 because headerRow includes "Year" at the beginning
      const value = numericMatrix[item][year];

      // Only apply number formatting to cells with numeric values
      if (value !== null && value !== undefined) {
        numberFormatRequests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: i + 2, // +2 to skip the header and unit info rows
              endRowIndex: i + 3,
              startColumnIndex: j,
              endColumnIndex: j + 1,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: "NUMBER",
                  pattern: "#,##0.00", // Show numbers with 2 decimal places
                },
              },
            },
            fields: "userEnteredFormat.numberFormat",
          },
        });
      }
    }
  }

  // Apply number formatting if there are any requests
  if (numberFormatRequests.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: numberFormatRequests,
        }),
      }
    );
  }

  // Skip chart creation if not requested
  if (!createCharts) {
    console.log(
      `Skipping chart creation for segment ${segmentKey} as requested`
    );
    return;
  }

  console.log(`Creating charts for segment ${segmentKey}`);

  // Calculate the starting position for charts
  // First chart position: below the main table
  const firstChartRowOffset = dataRows.length + 3; // +3 to account for header, unit info, and a buffer row

  // Define the second column position (charts in two columns as requested)
  const secondColumnOffset = years.length + 3; // +3 to provide spacing after the last year column

  // Create individual charts (in two columns, one below another)
  console.log(
    `Creating individual charts for ${items.length} items in segment ${segmentKey}`
  );
  for (let i = 0; i < items.length; i++) {
    try {
      console.log(`Preparing to create chart for item: ${items[i]}`);

      // Skip creating duplicate chart data - use the main table directly
      // Determine chart position: alternate between first and second column
      const columnIndex = i % 2 === 0 ? 0 : secondColumnOffset;
      const rowOffset = firstChartRowOffset + Math.floor(i / 2) * 20; // 20 rows per chart, staggered

      // Create chart using the original data table
      await createChart(token, spreadsheetId, sheetId, {
        title: `${items[i]} Trend`,
        // For startRow, use the item's row index from the data + offset for header and unit info
        startRow: 2 + i, // +2 for header and unit info rows
        endRow: 3 + i, // Just this item's row
        startCol: 0,
        endCol: years.length + 1,
        chartType: "COLUMN",
        chartPosition: {
          rowOffset: rowOffset,
          columnOffset: columnIndex,
          rowsSpan: 15,
          columnsSpan: 8,
        },
      });
    } catch (error) {
      console.error(`Error creating chart for ${items[i]}:`, error);
    }
  }
}

async function updateValues(token, spreadsheetId, range, values) {
  console.log(
    `Updating values in range ${range} with ${values.length} rows of data`
  );
  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: values,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to update values: ${response.status} ${response.statusText}`,
        errorText
      );
      throw new Error(`Failed to update values: ${response.statusText}`);
    }

    console.log(`Successfully updated values in range ${range}`);
    return await response.json();
  } catch (error) {
    console.error(`Error in updateValues for range ${range}:`, error);
    throw error;
  }
}

async function applyFormatting(token, spreadsheetId, sheetId, ranges) {
  const requests = [];

  // Format header row with bold text and background color
  if (ranges.headerRange) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: ranges.headerRange.startRow,
          endRowIndex: ranges.headerRange.endRow,
          startColumnIndex: ranges.headerRange.startCol,
          endColumnIndex: ranges.headerRange.endCol,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: {
              red: 0.2,
              green: 0.2,
              blue: 0.6,
              alpha: 1.0,
            },
            textFormat: {
              foregroundColor: {
                red: 1.0,
                green: 1.0,
                blue: 1.0,
              },
              bold: true,
              fontSize: 12,
            },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    });
  }

  // Format subheaders if specified
  if (ranges.subheaderRange) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: ranges.subheaderRange.startRow,
          endRowIndex: ranges.subheaderRange.endRow,
          startColumnIndex: ranges.subheaderRange.startCol,
          endColumnIndex: ranges.subheaderRange.endCol,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: {
              red: 0.8,
              green: 0.8,
              blue: 0.8,
              alpha: 1.0,
            },
            textFormat: {
              bold: true,
              italic: true,
            },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    });
  }

  // Auto-resize columns
  requests.push({
    autoResizeDimensions: {
      dimensions: {
        sheetId: sheetId,
        dimension: "COLUMNS",
        startIndex: 0,
        endIndex: 15, // Increased for more columns
      },
    },
  });

  // Apply the formatting
  if (requests.length > 0) {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: requests,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to apply formatting: ${response.statusText}`);
    }

    return await response.json();
  }
}

async function createChart(token, spreadsheetId, sheetId, chartInfo) {
  const {
    title,
    startRow,
    endRow,
    startCol,
    endCol,
    chartType,
    chartPosition,
  } = chartInfo;

  // Log information for debugging
  console.log(
    `Creating chart: ${title}, rows ${startRow}-${endRow}, cols ${startCol}-${endCol}, type ${chartType}`
  );

  // Generate chart series
  const series = generateChartSeries(
    sheetId,
    startRow,
    endRow,
    startCol,
    endCol,
    chartType
  );
  console.log("Generated chart series:", JSON.stringify(series, null, 2));

  // Use embedded chart with correct positioning
  const request = {
    addChart: {
      chart: {
        spec: {
          title: title,
          basicChart: {
            chartType: chartType,
            legendPosition: "RIGHT_LEGEND",
            headerCount: 1, // Specify that first row is headers
            axis: [
              {
                position: "BOTTOM_AXIS",
                title: "Year",
              },
              {
                position: "LEFT_AXIS",
                title: "Value",
              },
            ],
            domains: [
              {
                domain: {
                  sourceRange: {
                    sources: [
                      {
                        sheetId: sheetId,
                        startRowIndex: 0, // Always use the header row (years) for domain
                        endRowIndex: 1,
                        startColumnIndex: 1, // Skip the item name column
                        endColumnIndex: endCol,
                      },
                    ],
                  },
                },
              },
            ],
            series: series,
          },
        },
        position: {
          overlayPosition: {
            anchorCell: {
              sheetId: sheetId,
              rowIndex: chartPosition.rowOffset,
              columnIndex: chartPosition.columnOffset,
            },
            widthPixels: chartPosition.columnsSpan * 100,
            heightPixels: chartPosition.rowsSpan * 20,
          },
        },
      },
    },
  };

  console.log("Chart request payload:", JSON.stringify(request, null, 2));

  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [request],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to create chart: ${response.status} ${response.statusText}`,
        errorText
      );
      throw new Error(`Failed to create chart: ${response.statusText}`);
    }

    console.log(`Successfully created chart: ${title}`);
    return await response.json();
  } catch (error) {
    console.error(`Error creating chart ${title}:`, error);
    throw error;
  }
}

function generateChartSeries(
  sheetId,
  startRow,
  endRow,
  startCol,
  endCol,
  chartType
) {
  console.log(
    `Generating chart series for: sheetId=${sheetId}, rows=${startRow}-${endRow}, cols=${startCol}-${endCol}, type=${chartType}`
  );
  const series = [];

  // For pie charts, we need a different approach
  if (chartType === "PIE") {
    console.log("Generating pie chart series");
    // For pie charts, we need labels and values
    series.push({
      series: {
        sourceRange: {
          sources: [
            {
              sheetId: sheetId,
              startRowIndex: startRow,
              endRowIndex: endRow,
              startColumnIndex: 0, // Labels column
              endColumnIndex: 1,
            },
          ],
        },
      },
      targetAxis: "DOMAIN",
    });

    series.push({
      series: {
        sourceRange: {
          sources: [
            {
              sheetId: sheetId,
              startRowIndex: startRow,
              endRowIndex: endRow,
              startColumnIndex: 1, // Values column
              endColumnIndex: 2,
            },
          ],
        },
      },
      targetAxis: "METRIC",
    });

    return series;
  }

  // For a single item chart (one row)
  console.log("Generating single item trend chart series");
  series.push({
    series: {
      sourceRange: {
        sources: [
          {
            sheetId: sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: 1, // Skip the item name column, just use values
            endColumnIndex: endCol,
          },
        ],
      },
    },
    targetAxis: "LEFT_AXIS",
  });

  return series;
}

function formatSegmentName(segmentKey) {
  // Convert camelCase to readable format with spaces
  return segmentKey
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
