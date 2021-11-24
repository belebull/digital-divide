/* global d3 */
import * as topojson from 'topojson-client';
import loadData from './load-data';

function resize() {}

/*
USAGE: creates a cartogram of the U.S. with oulinted counties

SOURCES:
  - County Boundaries by Ian Johnson on Observable (https://observablehq.com/@enjalot/county-boundaries)
*/

function fixDiscrepancies() {}

function generateCountyData(data) {
  // filter out values for U.S. territories
  const { counties, states, broadband } = data;
  counties.features = counties.features.filter((county) => +county.id <= 57000);

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
    const counties = topojson.feature(us, us.objects.counties);
    console.log(broadband);
    console.log(generateCountyData({ counties, broadband, states }));
    createCartogram(counties);
  });
}

export default { init, resize };
