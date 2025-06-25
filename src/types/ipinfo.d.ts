// =============================
// ipinfo.d.ts
// TypeScript type declarations for the ipinfo library responses.
// Used for type safety in API geolocation logic.
// =============================

/**
 * @fileoverview Type definitions for ipinfo module.
 * @module types
 */

/**
 * Declaration for the ipinfo module that provides IP geolocation data.
 * @namespace ipinfo
 */
declare module "ipinfo" {
  /**
   * Interface representing location data returned by the ipinfo API.
   * @interface LocationData
   * @memberof ipinfo
   * @property {string} city - The city name associated with the IP address
   * @property {string} region - The region or state associated with the IP address
   * @property {string} country - The country code associated with the IP address
   */
  interface LocationData {
    city: string;
    region: string;
    country: string;
  }

  /**
   * Function to retrieve location information for an IP address.
   * @function ipinfo
   * @memberof ipinfo
   * @param {string} ip - The IP address to lookup
   * @returns {Promise<LocationData>} Promise resolving to location data
   */
  function ipinfo(ip: string): Promise<LocationData>;

  export = ipinfo;
}
