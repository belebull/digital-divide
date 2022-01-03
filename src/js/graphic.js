/* global d3 */
import { parse } from "handlebars";
import * as topojson from "topojson-client";
import _ from "lodash";
import lookupStateName from "./utils/lookup-state-name.js";
import loadData from "./load-data";

// elements for cartogram
let countyPaths;

let summaryCount;
let percentageSlider;
let percentageText;
let summaryType;

let threshold;
let type;

// elements for scatter plot
let comparisonPoints;
let usageLine;
let availabilityLine;
let usage;
let availability;
let x;
let y;

let availabilityAvg;
let usageAvg;
let stateAbbrs;
let stateNames;

let comparisonDropdown;
let availabilityPercentage;
let usagePercentage;

// elements for bar chart
let intersectionX;
let intersectionY;

let typeBtns;
let classBtns;
let metricBtns;
let intersectionType;
let intersectionClass;
let intersectionMetric;

function resize() {}

/* FIRST VISULIZATION */
function fixDiscrepancies(data) {
  const { counties, broadband } = data;
  const topoIds = [];
  const broadbandIds = [];

  // remove U.S. territories
  counties.features = counties.features.filter((county) => +county.id <= 57000);

  // get county ids from both
  broadband.forEach((county) => broadbandIds.push(+county.id));
  counties.features.forEach((county) => topoIds.push(+county.id));

  // identify county ids not in TopoJSON counties
  const noData = topoIds.filter((x) => broadbandIds.indexOf(x) === -1);
  counties.features = counties.features.filter(
    (county) => noData.indexOf(+county.id) === -1
  );

  return { counties, broadband };
}

function generateCountyData(data) {
  const { counties, broadband } = fixDiscrepancies(data);

  // update county information
  const updatedCounties = counties.features.map((county) => {
    const countyInfo = broadband.find(
      (broadbandCounty) => +broadbandCounty.id === +county.id
    );

    if (countyInfo == null) {
      console.log(county);
    }

    return {
      ...county,
      properties: {
        name: countyInfo.name,
        state: countyInfo.state,
        availability: +countyInfo.availability,
        usage: +countyInfo.usage,
      },
    };
  });

  return updatedCounties;
}

function filterCartogramCounties(county, threshold, type) {
  return +county.properties[type] >= threshold
    ? "selected-county"
    : "unselected-county";
}

/*
SOURCES:
  - Karim Douieb's 2016 Election Map on Observable (https://observablehq.com/@karimdouieb/try-to-impeach-this-challenge-accepted)
  - County Boundaries by Ian Johnson on Observable (https://observablehq.com/@enjalot/county-boundaries)
*/
function generateCartogram(data) {
  const { us, counties } = data;
  // set dimensions of map container for projection
  const width = document.getElementById("vis-cartogram").offsetWidth;
  const aspectRatio = 5 / 8;
  const height = width * aspectRatio;

  // create map container
  const svg = d3
    .select("#vis-cartogram")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // generate county features and projection
  const projection = d3
    .geoAlbersUsa()
    .fitSize([width, height], topojson.feature(us, us.objects.counties));
  const path = d3.geoPath(projection);

  // append state and county boundary paths to the SVG container
  const countyPaths = svg
    .append("g")
    .selectAll("path")
    .data(counties)
    .enter()
    .append("path")
    .attr("class", (county) =>
      filterCartogramCounties(county, threshold / 100, "availability")
    )
    .attr("d", path);

  svg
    .append("path")
    .datum(topojson.mesh(us, us.objects.counties), (a, b) => a !== b)
    .attr("fill", "none")
    .attr("stroke", "black")
    .attr("stroke-linejoin", "round")
    .attr("stroke-width", 1)
    .attr("d", path);

  return countyPaths;
}

function setupCartogram(data) {
  const { us, broadband } = data;

  // get necessary elements
  percentageSlider = d3.select("#cartogram-slider");
  percentageText = d3.select("#cartogram-percentage");
  summaryCount = d3.select("#summary-count").node();
  summaryType = d3.select("#summary-type");

  // set inital value of the slider
  threshold = percentageSlider.node().value;
  percentageText.text(`at least ${threshold}%`);

  // generate cartogram
  let counties = topojson.feature(us, us.objects.counties);
  counties = generateCountyData({ counties, broadband });
  countyPaths = generateCartogram({ us, counties });

  // set inital value for number of counties
  summaryCount.textContent = d3
    .selectAll(".selected-county")
    .size()
    .toLocaleString("en-US");

  // add event listeners
  percentageSlider.on("input", updateCartogram);
  summaryType.on("input", updateCartogram);
}

function updateCartogram() {
  // update threshold + text
  threshold = percentageSlider.node().value;
  threshold < 100
    ? percentageText.text(`at least ${threshold}%`)
    : percentageText.text(`${threshold}%`);

  // get type and filter counties
  type = summaryType.node().value;
  countyPaths.attr("class", (d) =>
    filterCartogramCounties(d, threshold / 100, type)
  );
  summaryCount.textContent = d3
    .selectAll(".selected-county")
    .size()
    .toLocaleString("en-US");
}

/* SECOND VISUALIZATION */

// SOURCE: https://stackoverflow.com/questions/15125920/how-to-get-distinct-values-from-an-array-of-objects-in-javascript
function populateStates(broadband) {
  stateAbbrs = [...new Set(broadband.map((county) => county.state))];
  stateNames = [];
  stateAbbrs.forEach((state) => stateNames.push(lookupStateName(state)));
}

/* SOURCES:
- https://www.d3-graph-gallery.com/graph/scatter_basic.html
- https://chartio.com/resources/tutorials/how-to-resize-an-svg-when-the-window-is-resized-in-d3-js/
- https://marcwie.github.io/blog/responsive-scatter-d3/
- https://stackoverflow.com/questions/27026625/how-to-change-line-color-in-d3js-according-to-axis-value
- https://www.d3-graph-gallery.com/graph/bubble_tooltip.html
- https://www.d3-graph-gallery.com/graph/custom_axis.html#axistitles
*/
function generateComparison(broadband) {
  const margin = {
    top: 30,
    bottom: 50,
    right: 25,
    left: 50,
  };
  const labelOffset = margin.left;
  const width = 275 - margin.left - margin.right;
  const height = 250 - margin.top - margin.bottom; // accounts for the height of the sticky header

  // make SVG responsive to window size changes
  const svg = d3
    .select("div#comparison-plot")
    .append("svg")
    .attr("preserveAspectRatio", "xMinYMin meet")
    .attr(
      "viewBox",
      `0 0 ${width + margin.left + margin.right + labelOffset} ${
        height + margin.top + margin.bottom
      }`
    )
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // create axes scales
  x = d3.scaleLinear().domain([0, 1]).range([0, width]);

  y = d3.scaleLinear().domain([0, 1]).range([height, 0]);

  const z = d3.scaleLinear().domain([70, 11000000]).range([0.75, 10]);

  svg
    .append("g")
    .attr("transform", `translate(0, ${height})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));

  svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));

  // add axes labels
  svg
    .append("text")
    .attr("text-anchor", "end")
    .attr("x", width)
    .attr("y", height + margin.bottom * 0.75)
    .attr("class", "svg-axis-label")
    .attr("id", "comparison-availability-line")
    .style("background-color", "#41b6c4")
    .text("Availability (% of population)")
    .style("color", "white");

  svg
    .append("text")
    .attr("text-anchor", "end")
    .attr("x", -margin.top / 2)
    .attr("y", -margin.left + 10)
    .attr("transform", "rotate(-90)")
    .attr("class", "svg-axis-label")
    .attr("id", "comparison-usage-line")
    .text("Usage (% of population)");

  // place scales correctly within container
  comparisonPoints = svg
    .append("g")
    .selectAll("dot")
    .data(broadband)
    .join("circle")
    .attr("cx", (d) => x(d.availability))
    .attr("cy", (d) => y(d.usage))
    .attr("r", (d) => z(d.total))
    .attr("class", "comparison-selected");

  // add median lines to the scatter plot
  availabilityLine = svg
    .append("line")
    .attr("x1", x(availabilityAvg))
    .attr("x2", x(availabilityAvg))
    .attr("y1", y(0))
    .attr("y2", y(1))
    .attr("stroke", "#2c7fb8")
    .attr("stroke-width", 0.75);

  usageLine = svg
    .append("line")
    .attr("x1", x(0))
    .attr("x2", x(1))
    .attr("y1", y(usageAvg))
    .attr("y2", y(usageAvg))
    .attr("stroke", "#081d58")
    .attr("stroke-width", 0.75);
}

// SOURCE: https://www.tutorialsteacher.com/d3js/animation-with-d3js
function updateComparison() {
  const selectedState = comparisonDropdown.node().value;

  comparisonPoints.attr("class", (d) =>
    d.state === selectedState || selectedState === "US"
      ? "comparison-selected"
      : "comparison-unselected"
  );

  const selectedStateInfo =
    comparisonDropdown.node().options[comparisonDropdown.node().selectedIndex];
  const selectedStateAvailAvg = selectedStateInfo.availabilityAvg;
  const selectedStateUsageAvg = selectedStateInfo.usageAvg;

  availabilityLine
    .transition()
    .duration(1000)
    .delay(500)
    .attr("x1", x(selectedStateAvailAvg))
    .attr("x2", x(selectedStateAvailAvg));

  usageLine
    .transition()
    .duration(1000)
    .delay(1750)
    .attr("y1", y(selectedStateUsageAvg))
    .attr("y2", y(selectedStateUsageAvg));

  availabilityPercentage.node().innerHTML = `${Math.round(
    selectedStateAvailAvg * 100
  )}%`;
  usagePercentage.node().innerHTML = `${Math.round(
    selectedStateUsageAvg * 100
  )}%`;
}

// SOURCE: https://stackoverflow.com/questions/8674618/adding-options-to-select-with-javascript
function setupComparison(data) {
  const { broadband, averages } = data;
  // calculate the average of the county metrics
  availability = [];
  usage = [];
  broadband.forEach((county) => {
    availability.push(+county.availability);
    usage.push(+county.usage);
  });

  availabilityAvg =
    availability.reduce((a, b) => a + b, 0) / availability.length;
  usageAvg = usage.reduce((a, b) => a + b, 0) / usage.length;

  // visualization elements
  comparisonDropdown = d3.select("#comparison-state");
  availabilityPercentage = d3.select("#comparison-availability");
  usagePercentage = d3.select("#comparison-usage");

  // set text in summary
  availabilityPercentage.node().innerHTML = `${Math.round(
    availabilityAvg * 100
  )}%`;
  usagePercentage.node().innerHTML = `${Math.round(usageAvg * 100)}%`;

  // dynamically add states to dropdown
  populateStates(broadband);
  const usOpt = document.createElement("option");
  usOpt.value = "US";
  usOpt.innerHTML = "the United States";
  usOpt.availabilityAvg = availabilityAvg;
  usOpt.usageAvg = usageAvg;
  comparisonDropdown.node().appendChild(usOpt);

  // add options for each state
  stateNames.forEach((state, index) => {
    const stateOpt = document.createElement("option");
    stateOpt.value = stateAbbrs[index];
    stateOpt.innerHTML = state;
    const stateInfo = averages.filter(
      (stateAbbr) => stateAbbr.state === stateAbbrs[index]
    )[0];
    stateOpt.availabilityAvg = +stateInfo.availability;
    stateOpt.usageAvg = +stateInfo.usage;
    comparisonDropdown.node().appendChild(stateOpt);
  });

  // generate the visualization
  generateComparison(broadband);

  // add event listeners
  comparisonDropdown.on("input", updateComparison);
}

/* THIRD VISUALIZATION */

/* SOURCES:
- https://jsfiddle.net/ysr5aohw/
- https://www.d3-graph-gallery.com/graph/barplot_button_data_hard.html
- https://www.d3-graph-gallery.com/graph/barplot_horizontal.html
*/
function generateIntersection(broadband) {
  const container = d3.select("#intersection").node();
  const margin = { top: 20, bottom: 20, right: 0, left: 60 };
  const width = window.innerWidth / 4 - margin.left - margin.right;
  const height = 350 - margin.top - margin.bottom;

  // append SVG
  const svg = d3
    .select("#intersection-plot")
    .append("svg")
    .attr("perserveAspectRatio", "xMinYMin meet")
    .attr(
      "viewBox",
      `0 0 ${width + margin.left + margin.right} ${
        height + margin.top + margin.bottom
      }`
    )
    .classed("svg-content", true)
    .append("g")
    .attr("transform", `translate (${margin.left}, ${margin.top})`)
    .attr("id", "intersection-plotSVG");

  // create axes functions
  intersectionX = d3.scaleLinear().range([0, width]);

  intersectionY = d3.scaleBand().range([0, height]).padding(0.2);

  svg
    .append("g")
    .attr("id", "intersection-x")
    .attr("transform", `translate(${margin.left}, ${height})`)
    .call(d3.axisBottom(intersectionX).tickFormat(d3.format(".0%")))
    .selectAll("text");
  svg
    .append("g")
    .attr("id", "intersection-y")
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(intersectionY));

  // initialize data
  const data = generateIntersectionData(
    broadband,
    "availability",
    "metro",
    "low"
  );

  updateIntersection(data);

  // // get domain for availability
  // const domain = [];
  // data.forEach((county) => domain.push(+county.availability));

  // add axes to SVGs

  // const bars = svg
  //   .selectAll("rect")
  //   .data(data)
  //   .join("rect")
  //   .attr("x", intersectionX(0) + margin.left)
  //   .attr("y", (d) => intersectionY(`${d.name}, ${d.state}`))
  //   .attr("width", (d) => intersectionX(d.availability))
  //   .attr("height", (d) => intersectionY.bandwidth())
  //   .attr("fill", "blue")
  //   .attr("class", "bars");
}

// SOURCE: https://stackoverflow.com/questions/1129216/sort-array-of-objects-by-string-property-value?page=1&tab=votes#tab-top
function generateIntersectionData(broadband, metric, type, income) {
  const counties = broadband.filter(
    (county) =>
      county.type === type &&
      county.class === income &&
      county.availability !== "" &&
      county.usage !== ""
  );
  counties.sort((a, b) => a[metric] > b[metric]);
  return counties.slice(0, 15);
}

function setupIntersection(broadband) {
  // get buttons for graph
  typeBtns = d3.selectAll("#type .button");
  classBtns = d3.selectAll("#class .button");
  metricBtns = d3.selectAll("#metric .button");
  let newData;

  // set initial values
  intersectionType = "metro";
  intersectionClass = "low";
  intersectionMetric = "availability";

  typeBtns.on("click", function () {
    d3.select("#type .current").classed("current", false);
    d3.select(this).classed("current", true);
    intersectionType = d3.select(this).attr("data-val");
    newData = generateIntersectionData(
      broadband,
      intersectionMetric,
      intersectionType,
      intersectionClass
    );
    updateIntersection(newData);
  });
  classBtns.on("click", function () {
    d3.select("#class .current").classed("current", false);
    d3.select(this).classed("current", true);
    intersectionClass = d3.select(this).attr("data-val");
    newData = generateIntersectionData(
      broadband,
      intersectionMetric,
      intersectionType,
      intersectionClass
    );
    updateIntersection(newData);
  });
  metricBtns.on("click", function () {
    d3.select("#metric .current").classed("current", false);
    d3.select(this).classed("current", true);
    intersectionMetric = d3.select(this).attr("data-val");
    newData = generateIntersectionData(
      broadband,
      intersectionMetric,
      intersectionType,
      intersectionClass
    );
    updateIntersection(newData);
  });

  generateIntersection(broadband);
}

/* SOURCES:
- https://jsfiddle.net/ysr5aohw/
- https://www.d3-graph-gallery.com/graph/barplot_button_data_hard.html
- https://www.d3-graph-gallery.com/graph/barplot_button_data_simple.html
- https://www.d3-graph-gallery.com/graph/barplot_horizontal.html
- https://flowingdata.com/projects/2018/dating-pool/
- https://stackoverflow.com/questions/65065161/dynamically-update-styling-on-button-click-d3-bar-chart
- http://bl.ocks.org/phoebebright/3098488
- https://www.cloudhadoop.com/2020/02/different-ways-of-remove-property-in.html
- https://javascript.tutorialink.com/creating-a-table-with-d3/
*/

function updateIntersection(data) {
  // update the chart
  const svg = d3.select("#intersection-plotSVG");

  const domain = [];
  data.forEach((county) => domain.push(+county[intersectionMetric]));

  intersectionX.domain([0, d3.max(domain)]).ticks(4);

  intersectionY.domain(data.map((d) => `${d.name}, ${d.state}`));

  svg
    .select("#intersection-x")
    .transition()
    .duration(1000)
    .call(d3.axisBottom(intersectionX).tickFormat(d3.format(".0%")));
  svg
    .select("#intersection-y")
    .transition()
    .duration(1000)
    .call(d3.axisLeft(intersectionY));

  const bars = svg.selectAll(".bars").data(data);

  bars
    .enter()
    .append("rect")
    .merge(bars)
    .attr("class", "bars")
    .attr("x", intersectionX(0) + 60)
    .attr("y", (d) => intersectionY(`${d.name}, ${d.state}`))
    .attr("width", (d) => intersectionX(d[intersectionMetric]))
    .attr("height", (d) => intersectionY.bandwidth())
    .attr("fill", (d) => (d.white_type === "over" ? "#c9c9c9" : "#253494"))
    .attr("stroke", (d) => (d.white_type === "under" ? "#081d58" : "#5b5b5b"))
    .attr("stroke-width", "0.5")
    .attr("id", (d, i) => `bar-${i}`)
    .on("mouseenter", function () {
      d3.selectAll(".selectedBar").classed("selectedBar", false);
      d3.selectAll(".selectedRow").classed("selectedRow", false);

      d3.select(this).classed("selectedBar", true);
      const row = d3.select(this).attr("id");
      highlightRow(row);
    })
    .on("mouseleave", () => {
      d3.selectAll(".selectedBar").classed("selectedBar", false);
      d3.selectAll(".selectedRow").classed("selectedRow", false);
    });

  bars.exit().remove();

  // get relevant data for table
  const allKeys = Object.keys(data[0]);
  const tableKeys = [
    "name",
    "state",
    "white_percent",
    "black_percent",
    "latino_percent",
    "asian_percent",
    "native_percent",
    intersectionMetric,
  ];
  const nonTableKeys = allKeys.filter((key) => !tableKeys.includes(key));
  const tableData = data.map((county) => _.omit(county, ...nonTableKeys));

  // update table
  const table = d3.select("#table-body");
  d3.select("#table-header-metric").node().innerHTML =
    _.capitalize(intersectionMetric);

  let rows = table.selectAll("tr").data(tableData);
  rows.exit().remove();
  rows = rows
    .enter()
    .append("tr")
    .merge(rows)
    .attr("id", (d, i) => `row-${i}`)
    .attr("class", "table-rows");
  const cells = rows
    .selectAll("td")
    .data((d, i) => [
      `${d.name}, ${d.state}`,
      `${Math.round(d[intersectionMetric] * 100)}%`,
      `${Math.round(d.white_percent * 100)}%`,
      `${Math.round(d.black_percent * 100)}%`,
      `${Math.round(d.asian_percent * 100)}%`,
      `${Math.round(d.latino_percent * 100)}%`,
      `${Math.round(d.native_percent * 100)}%`,
    ]);
  cells.exit().remove();
  cells
    .enter()
    .append("td")
    .text((d) => d);
  cells.text((d) => d);
}

function highlightRow(row) {
  const rowId = row.split("-")[1];
  d3.select(`#row-${rowId}`).classed("selectedRow", true);
}

function generateTypeMultiples(broadband, category) {
  const margin = { top: 60, right: 0, bottom: 30, left: 50 };
  const width = 250 - margin.left;
  const height = 300 - margin.top;
  const labelOffset = margin.left;

  // add svgs for each class
  const svg = d3
    .select(`#static-${category}`)
    .append("svg")
    .attr("perserveAspectRatio", "xMinYMin meet")
    .attr(
      "viewBox",
      `0 0 ${(width + margin.left + margin.right + labelOffset) * 3} ${
        height + margin.top + margin.bottom
      }`
    );

  // setup axes
  const x = d3.scaleLinear().domain([0, 1]).range([0, width]);
  const y = d3.scaleLinear().domain([0, 1]).range([height, margin.top]);
  const z = d3.scaleLinear().domain([74, 11000000]).range([2, 10]);

  const countyTypes =
    category === "type"
      ? ["metro", "micro", "neither"]
      : ["high", "middle", "low"];

  countyTypes.forEach((countyType, index) => {
    const data = broadband.filter((county) => county[category] === countyType);
    const gType = svg
      .append("g")
      .attr("id", `type-${countyType}`)
      .attr(
        "transform",
        `translate(${
          index * (width + margin.left + margin.right + labelOffset) +
          labelOffset
        }, 0)`
      );

    const gTitle =
      category === "type"
        ? _.capitalize(countyType)
        : `${_.capitalize(countyType)}-Income`;

    gType
      .append("text")
      .attr("class", "label")
      .attr("x", (width - margin.left - labelOffset) / 2)
      .attr("y", margin.top / 2)
      .style("text-anchor", "center")
      .text(`${gTitle} Areas`)
      .style("font-size", "14px");

    gType
      .selectAll("circle")
      .data(data)
      .enter()
      .append("circle")
      .attr("r", (d) => z(d.total))
      .attr("cx", (d) => x(d.availability))
      .attr("cy", (d) => y(d.usage))
      .attr("class", `${countyType}-dots`)
      .attr("opacity", "0.3");

    gType
      .append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));
    gType
      .append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));

    gType
      .append("text")
      .attr("text-anchor", "end")
      .attr("x", width)
      .attr("y", height + margin.bottom * 1.5)
      .attr("class", "axes-lables")
      .style("font-size", "10px")
      .text("Availability (% of population)");

    gType
      .append("text")
      .attr("text-anchor", "end")
      .attr("x", -margin.top)
      .attr("y", margin.left - labelOffset * 1.85)
      .attr("transform", "rotate(-90)")
      .style("font-size", "10px")
      .text("Usage (% of population)");
  });
}

function init() {
  // load necessary datasets
  loadData(["usTopo.json", "broadband.csv", "averages.csv"]).then((result) => {
    const us = result[0];
    let broadband = result[1];
    const averages = result[2];

    // clean data
    broadband = broadband.filter(
      (county) => county.availability !== "" && county.usage !== ""
    );

    // render graphs
    setupCartogram({ us, broadband });
    setupComparison({ broadband, averages });
    generateTypeMultiples(broadband, "type");
    generateTypeMultiples(broadband, "class");
    setupIntersection(broadband);
  });
}

export default { init, resize };
