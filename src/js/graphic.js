/* global d3 */
import { parse } from "handlebars";
import * as topojson from "topojson-client";
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
  const width =
    document.getElementsByClassName("chart-cartogram")[0].offsetWidth;
  const aspectRatio = 5 / 8;
  const height = width * aspectRatio;

  // create map container
  const svg = d3
    .select(".chart-cartogram")
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
    .attr("stroke", "white")
    .attr("stroke-linejoin", "round")
    .attr("stroke-width", 0.5)
    .attr("d", path);

  return countyPaths;
}

function setupCartogram(data) {
  const { us, broadband } = data;

  // get necessary elements
  percentageSlider = d3.select("#percentage-slider-input");
  percentageText = d3.select("#percentage-text");
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
  // create SVG and set dimensions
  const svg = d3.select("div#comparison-plot").append("svg");
  const container = svg.node().parentNode;
  const margin = {
    top: 30,
    bottom: 10,
    right: container.clientWidth / 6,
    left: container.clientWidth / 6,
  };
  const axisOffset = 10;
  const labelOffset = 30;
  const width = (container.clientWidth * 2) / 3;
  const height = (width * 2) / 3; // accounts for the height of the sticky header

  // make SVG responsive to window size changes
  svg
    .attr("preserveAspectRatio", "xMinYMin meet")
    .attr(
      "viewBox",
      `0 0 ${width + margin.left + margin.right + axisOffset + labelOffset} ${
        height + margin.top + margin.bottom + labelOffset
      }`
    )
    .classed("svg-content", true);

  // create axes scales
  x = d3
    .scaleLinear()
    .domain([0, 1])
    .range([margin.left + axisOffset, width]);

  y = d3
    .scaleLinear()
    .domain([0, 1])
    .range([height, margin.top - axisOffset]);

  const z = d3.scaleLinear().domain([74, 10105722]).range([1.5, 30]);

  // place scales correctly within container
  svg
    .append("g")
    .attr("transform", `translate(0, ${height - margin.bottom + axisOffset})`)
    .call(d3.axisBottom(x).tickSize(5).tickFormat(d3.format(".0%")));

  svg
    .append("g")
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(y).tickSize(5).tickFormat(d3.format(".0%")));

  // add axes labels
  svg
    .append("text")
    .attr("text-anchor", "end")
    .attr("x", width)
    .attr("y", height + axisOffset + 35)
    .style("font-size", "14px")
    .text("Availability (% of population)");

  svg
    .append("text")
    .attr("text-anchor", "end")
    .attr("x", -labelOffset)
    .attr("y", margin.left - labelOffset - axisOffset * 2)
    .attr("transform", "rotate(-90)")
    .style("font-size", "14px")
    .text("Usage (% of population)");

  comparisonPoints = svg
    .append("g")
    .selectAll("dot")
    .data(broadband)
    .enter()
    .append("circle")
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
    .attr("stroke", "#750175")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", 5)
    .attr("opacity", 0.5);

  usageLine = svg
    .append("line")
    .attr("x1", x(0))
    .attr("x2", x(1))
    .attr("y1", y(usageAvg))
    .attr("y2", y(usageAvg))
    .attr("stroke", "#ea519d")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", 3);
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

function init() {
  // load necessary datasets
  loadData(["usTopo.json", "broadband.csv", "averages.csv"]).then((result) => {
    const us = result[0];
    const broadband = result[1];
    const averages = result[2];

    setupCartogram({ us, broadband });
    setupComparison({ broadband, averages });
  });
}

export default { init, resize };
