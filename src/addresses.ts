import rinkebyAddresses from '@tulilabs/core/dist/addresses/4.json'
import mainnetAddresses from '@tulilabs/core/dist/addresses/1.json'
import polygonAddresses from '@tulilabs/core/dist/addresses/137.json'
import bscAddresses from '@tulilabs/core/dist/addresses/56.json'

interface AddressBook {
  [key: string]: {
    [key: string]: string
  }
}

/**
 * Mapping from Network to Officially Deployed Instances of the Zora Media Protocol
 */
export const addresses: AddressBook = {
  rinkeby: rinkebyAddresses,
  mainnet: mainnetAddresses,
  polygon: polygonAddresses,
  bsc: bscAddresses,
}
