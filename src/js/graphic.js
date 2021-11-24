/* global d3 */
import * as topojson from 'topojson-client';
import loadData from './load-data';

function resize() {}

/*
USAGE: creates a cartogram of the U.S. with oulinted counties

SOURCES:
  - County Boundaries by Ian Johnson on Observable (https://observablehq.com/@enjalot/county-boundaries)
*/
function createCartogram(data) {
  // set dimensions of map container for projection
  const width =
    document.getElementsByClassName('chart-cartogram')[0].offsetWidth;
  const aspectRatio = 0.6256410256410256;

  // create map container
  const svg = d3
    .select('.chart-cartogram')
    .append('svg')
    .attr('width', width)
    .attr('height', width * aspectRatio);

  // generate county features and projection
  const counties = topojson.feature(data.us, data.us.objects.counties);
  const projection = d3
    .geoAlbersUsa()
    .fitSize([width, width * aspectRatio], counties);
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
  loadData(['us-10m-unprojected.json', 'broadband.csv']).then((result) => {
    const us = result[0];
    const broadband = result[1];
    console.log(us);

    // generate cartogram
    createCartogram({ us, broadband });
  });
}

export default { init, resize };
