/* global d3 */
import * as topojson from 'topojson-client';
import loadData from './load-data';

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
    const countyName = broadbandCounty.name.split(' ', 2)[0];
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

  return counties;
}

function generateCountyData(data) {
  const { counties, states, broadband } = data;

  // update county information
  const updatedCounties = counties.features.map((county) => {
    const countyState = states.find(
      (state) => state.STATE === county.properties.STATEFP
    );

    const name = `${county.properties.NAME} County`;

    return {
      ...county,
      properties: {
        name,
        state: countyState.STUSAB,
      },
    };
  });

  return updatedCounties;
}

/*
USAGE: creates a cartogram of the U.S. with oulinted counties

SOURCES:
  - County Boundaries by Ian Johnson on Observable (https://observablehq.com/@enjalot/county-boundaries)
*/
function createCartogram(counties) {
  // set dimensions of map container for projection
  const width =
    document.getElementsByClassName('chart-cartogram')[0].offsetWidth;
  const aspectRatio = 5 / 8;
  const height = width * aspectRatio;

  // create map container
  const svg = d3
    .select('.chart-cartogram')
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  // generate county features and projection
  const projection = d3.geoAlbersUsa().fitSize([width, height], counties);
  const path = d3.geoPath(projection);

  // append state and county boundary paths to the SVG container
  svg
    .append('g')
    .selectAll('path')
    .data(counties.features)
    .join('path')
    .attr('fill', 'blue')
    .attr('stroke', 'black')
    .attr('d', path);
}

function init() {
  // load necessary datasets
  loadData(['usTopo.json', 'broadband.csv', 'stateFips.tsv']).then((result) => {
    const us = result[0];
    const broadband = result[1];
    const states = result[2];
    // generate cartogram
    let counties = topojson.feature(us, us.objects.counties);
    counties = fixDiscrepancies({ counties, broadband });
    console.log(generateCountyData({ counties, broadband, states }));
    createCartogram(counties);
  });
}

export default { init, resize };
