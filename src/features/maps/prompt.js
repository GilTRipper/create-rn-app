const inquirer = require("inquirer");

async function prompt(ctx) {
  const { options, config } = ctx;
  config.maps = {
    enabled: false,
    provider: null,
    googleMapsApiKey: null,
    mapboxToken: null,
  };

  if (options.yes) {
    return;
  }

  const { mapsSelection } = await inquirer.prompt([
    {
      type: "list",
      name: "mapsSelection",
      message: "Will you be using maps?",
      choices: [
        { name: "react-native-maps", value: "react-native-maps" },
        { name: "Mapbox", value: "mapbox" },
        { name: "Cancel", value: "__CANCEL__" },
      ],
      default: "__CANCEL__",
    },
  ]);

  if (mapsSelection === "react-native-maps") {
    config.maps.enabled = true;
    config.maps.provider = "react-native-maps";

    const { enableGoogleMaps } = await inquirer.prompt([
      {
        type: "confirm",
        name: "enableGoogleMaps",
        message: "Do you want to configure Google Maps?",
        default: false,
      },
    ]);

    if (enableGoogleMaps) {
      config.maps.provider = "google-maps";

      const { googleMapsApiKey } = await inquirer.prompt([
        {
          type: "input",
          name: "googleMapsApiKey",
          message:
            "Enter your Google Maps API key (or press Enter to skip and configure later):",
          default: "",
        },
      ]);

      if (googleMapsApiKey && googleMapsApiKey.trim().length > 0) {
        config.maps.googleMapsApiKey = googleMapsApiKey.trim();
      }
    }
  } else if (mapsSelection === "mapbox") {
    config.maps.enabled = true;
    config.maps.provider = "mapbox";

    const { mapboxToken } = await inquirer.prompt([
      {
        type: "input",
        name: "mapboxToken",
        message:
          "Enter your Mapbox access token (or press Enter to skip and configure later):",
        default: "",
      },
    ]);

    if (mapboxToken && mapboxToken.trim().length > 0) {
      config.maps.mapboxToken = mapboxToken.trim();
    }
  }
}

module.exports = { prompt };
