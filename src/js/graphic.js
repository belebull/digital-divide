/* global d3 */
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

function init() {
  // load necessary datasets
  loadData(["usTopo.json", "broadband.csv"]).then((result) => {
    const us = result[0];
    const broadband = result[1];

    setupCartogram({ us, broadband });
  });
}

export default { init, resize };
