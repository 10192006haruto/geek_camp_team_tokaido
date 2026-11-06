import type { Location } from "./restaurant-types";
import { locationErrorMessage, SearchFailure } from "./search";

type LocationEnvironment = { secure: boolean; geolocation?: Pick<Geolocation, "getCurrentPosition"> };
export function getLocation(environment: LocationEnvironment = { secure: window.isSecureContext, geolocation: navigator.geolocation }): Promise<Location> {
  return new Promise((resolve, reject) => {
    if (!environment.secure || !environment.geolocation) {
      reject(new SearchFailure("位置情報を利用できません。HTTPSまたはlocalhostで、位置情報に対応したブラウザをお使いください。"));
      return;
    }
    environment.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => reject(new SearchFailure(locationErrorMessage(error.code))),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
  });
}
