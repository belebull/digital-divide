/* global d3 */
import { parse } from "handlebars";
import * as topojson from "topojson-client";
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
let usage;
let availability;

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

function filterCounties(county, threshold, type) {
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
      filterCounties(county, threshold / 100, "availability")
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
  countyPaths.attr("class", (d) => filterCounties(d, threshold / 100, type));
  summaryCount.textContent = d3
    .selectAll(".selected-county")
    .size()
    .toLocaleString("en-US");
}

/* SECOND VISUALIZATION */
// SOURCE: https://www.w3resource.com/javascript-exercises/fundamental/javascript-fundamental-exercise-88.php
function calcMedian(arr) {
  const mid = Math.floor(arr.length / 2);
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function dragstarted() {
  d3.select(this).classed("active-drag", true);
}

function dragged() {
  const x = d3.event.dx;
  const y = d3.event.dy;

  const line = d3.select(this);

  const attributes = {
    x1: parseInt(line.attr("x1")) + x,
    y1: parseInt(line.attr("y1")) + y,
    x2: parseInt(line.attr("x2")) + x,
    y2: parseInt(line.attr("y2")) + y,
  };

  line.attr(attributes);
}

function draggedend() {
  d3.select(this).classed("active-drag", false);
}
/* SOURCES:
- https://www.d3-graph-gallery.com/graph/scatter_basic.html
- https://chartio.com/resources/tutorials/how-to-resize-an-svg-when-the-window-is-resized-in-d3-js/
- https://marcwie.github.io/blog/responsive-scatter-d3/
- https://stackoverflow.com/questions/27026625/how-to-change-line-color-in-d3js-according-to-axis-value
*/
function generateComparison(broadband) {
  // create SVG and set dimensions
  const svg = d3.select("div#comparison-plot").append("svg");
  const container = svg.node().parentNode;
  const margin = { vertical: 60, horizontal: 80 };
  const axisOffset = 10;
  const width = (container.clientWidth * 4) / 5;
  const height = (width * 4) / 5 - margin.vertical; // accounts for the height of the sticky header

  // make SVG responsive to window size changes
  svg
    .attr("preserveAspectRatio", "xMinYMin meet")
    .attr(
      "viewBox",
      `0 0 ${width + 2 * margin.horizontal + axisOffset} ${
        height + 2 * margin.vertical + axisOffset
      }`
    )
    .classed("svg-content", true);

  // create axex scales
  const x = d3
    .scaleLinear()
    .domain([0, 100])
    .range([margin.horizontal + axisOffset, width - margin.horizontal]);

  const y = d3
    .scaleLinear()
    .domain([0, 100])
    .range([height - margin.vertical - axisOffset, margin.vertical]);

  // place scales correctly within container
  svg
    .append("g")
    .attr(
      "transform",
      `translate(0, ${height - margin.horizontal + axisOffset})`
    )
    .call(d3.axisBottom(x));

  svg
    .append("g")
    .attr("transform", `translate(${margin.vertical}, 0)`)
    .call(d3.axisLeft(y));

  svg
    .append("g")
    .selectAll("dot")
    .data(broadband)
    .enter()
    .append("circle")
    .attr("cx", (d) => x(d.availability * 100))
    .attr("cy", (d) => y(d.usage * 100))
    .attr("r", 2)
    .style("fill", "blue");

  // calculate the median of the county metrics
  availability = [];
  usage = [];
  broadband.forEach((county) => {
    availability.push(+county.availability);
    usage.push(+county.usage);
  });

  const availabilityMedian = calcMedian(availability);
  const usageMedian = calcMedian(usage);

  // add median lines to the scatter plot
  svg
    .append("line")
    .attr("x1", x(availabilityMedian * 100))
    .attr("x2", x(availabilityMedian * 100))
    .attr("y1", y(0))
    .attr("y2", y(100))
    .attr("stroke", "green")
    .attr("stroke-width", 2);
  svg
    .append("line")
    .attr("x1", x(0))
    .attr("x2", x(100))
    .attr("y1", y(usageMedian * 100))
    .attr("y2", y(usageMedian * 100))
    .attr("stroke", "red")
    .attr("stroke-width", 2);
}

function init() {
  // load necessary datasets
  loadData(["usTopo.json", "broadband.csv"]).then((result) => {
    const us = result[0];
    const broadband = result[1];

    setupCartogram({ us, broadband });
    generateComparison(broadband);
  });
}

export default { init, resize };
