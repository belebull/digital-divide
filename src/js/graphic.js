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

/* USAGE: make sure the county ids are the same in both broadband dataset and the TopoJSON */
function fixDiscrepancies(data) {
  const { counties, broadband } = data;
  const topoIds = [];
  const broadbandIds = [];

  // remove U.S. territories
  counties.features = counties.features.filter((county) => +county.id <= 57000);

  // get county ids from bothe
  broadband.forEach((county) => broadbandIds.push(+county.id));
  counties.features.forEach((county) => topoIds.push(+county.id));

  // identify county ids not in TopoJSON counties
  const missingInTopo = broadbandIds.filter((x) => topoIds.indexOf(x) === -1);
  missingInTopo.forEach((countyId) => {
    // get county information from broadban
    const broadbandIdx = broadbandIds.indexOf(countyId);
    const broadbandCounty = broadband[broadbandIdx];

    // get corresponding TopoJSON
    const countyName = broadbandCounty.name.split(" ", 2)[0];
    const topoIdx = counties.features.findIndex((county) =>
      county.properties.NAME.includes(countyName)
    );
    const topoCounty = counties.features[topoIdx];

    // update TopoJSON
    const topoCountyId =
      String(countyId).length === 4 ? `0${String(countyId)}` : String(countyId);
    topoCounty.id = topoCountyId;
    topoCounty.properties.GEOID = topoCountyId;
    counties.features[topoIdx] = topoCounty;
  });

  return { counties, broadband };
}

// USAGE: update county properties of TopoJSON
function generateCountyData(data) {
  // clean county data
  const { counties, broadband } = fixDiscrepancies(data);

  // update county information
  const updatedCounties = counties.features.map((county) => {
    const { abbr, id, name, availability, usage } = broadband.find(
      (broadbandCounty) => +broadbandCounty.id === +county.id
    );

    return {
      ...county,
      properties: {
        name,
        state: abbr,
        availability: +availability,
        usage: +usage,
      },
    };
  });

  return updatedCounties;
}

// USAGE: assigns class based on user-set threshold
function filterCounties(county, threshold, type) {
  return +county.properties[type] >= threshold
    ? "selected-county"
    : "unselected-county";
}

/*
USAGE: creates a cartogram of the U.S. counties

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

// setup event listeners and cartogram
function setupCartogram(data) {
  const { us, broadband } = data;
  // add event listeners for cartogram
  percentageSlider = d3.select("#percentage-slider-input");
  percentageText = d3.select("#percentage-text");
  summaryCount = d3.select("#summary-count").node();
  summaryType = d3.select("#summary-type");

  console.log(summaryType.node());

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

function init() {
  // load necessary datasets
  loadData(["usTopo.json", "broadband.csv"]).then((result) => {
    const us = result[0];
    const broadband = result[1];

    setupCartogram({ us, broadband });
    percentageSlider.on("input", updateCartogram);
    summaryType.on("input", updateCartogram);
  });
}

export default { init, resize };
