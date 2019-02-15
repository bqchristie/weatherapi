let TemperatureReading = require("../models/temperatureReading");
let _ = require("lodash");
let axios = require("axios");
let moment = require("moment");

/**
 * Return saved readings for a given list of cities
 * within a given time threshold.
 *
 * @param cities
 * @returns {Promise<any>}
 */
function getExistingReadings(cities) {
  return new Promise(function(resolve, reject) {
    TemperatureReading.find({
      city: { $in: cities },
      createdAt: { $gt: getRefreshTreshold() }
    }).then(results => {
      resolve(results);
    });
  }).catch(err => reject(err));
}

/**
 *  Returns the Date that we use to determine if we need
 *  a fresh reading.  The refresh interval and units are stored in the .env file.
 *
 * @returns {Date}
 */
function getRefreshTreshold() {
  return moment()
    .subtract(process.env.REFRESH_INTERVAL, process.env.REFRESH_UNIT)
    .toDate();
}

/**
 * Compares the list of cities requested vs the list of cities where
 * we already have readings.  For the missing cities we'll make an API call
 * and save to the DB.  We then return the list of new readings.
 *
 * @param savedCities
 * @param requestedCities
 */
function getMissingReadings(requestedCities, existingReadings) {
  return new Promise(function(resolve, reject) {
    let missingCities = getMissingCities(requestedCities, existingReadings);

    Promise.all(getOpenWeatherCalls(missingCities))
      .then(responses => {
        let readings = [];
        responses.forEach(resp => {
          readings.push(createTemperatureReading(resp.data));
        });
        resolve(readings);
      })
      .catch(err => {
        reject(err);
      });
  });
}

/**
 * Takes a String array of cities and an object array of existing readings. First
 * it maps object array to a string array then does a compare returning
 * the values in requested cities that are not in
 *
 * @param requestedCities
 * @param existingTemps
 * @returns {*}
 */
function getMissingCities(requestedCities, existingTemps) {
  return _.difference(
    requestedCities,
    _.map(existingTemps, "city")
  );
}

/**
 *  Writes a temperature reading to MongoDB
 *
 * @param data
 */
function createTemperatureReading(data) {
  let reading = new TemperatureReading({
    city: data.name,
    temperature: data.main.temp
  });
  reading.save();
  return reading;
}

/**
 * Returns an array of promises calling the Open Weather API for a
 * given list of cities.
 *
 * @param cities
 * @returns {*}
 */
function getOpenWeatherCalls(cities) {
  return cities.map(city => {
    return axios.get(getOpenWeatherUrl(city));
  });
}

/**
 * Assembles a URL using properties from the .env file and the given city.
 *
 * @param city
 * @returns {string}
 */
function getOpenWeatherUrl(city) {
  return `${process.env.OPEN_WEATHER_URL}?q=${city}&units=${
    process.env.OPEN_WEATHER_UNITS
    }&APPID=${process.env.OPEN_WEATHER_API_KEY}`;
}

/**
 * This is the public access method for a list of TemperatureReadings for a given
 * list of cities.
 *
 * @param cities
 * @returns {Promise<any>}
 */
async function getReadings(cities) {
  const existingReadings = await getExistingReadings(cities);
  const newReadings = await getMissingReadings(cities, existingReadings);
  return existingReadings.concat(newReadings);
}

module.exports = {
  getReadings: getReadings
};
