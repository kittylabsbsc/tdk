## Users

See the below example usage of `getTuliProfiles`, which queries the Tuli profile information of a batch of ETH addresses (up to 100).

```typescript
import { getTuliProfiles } from '@tulilabs/tdk'

;(async () => {
  const addresses = [
    '0xBE7eb2a7A9C949322Fgjkc857FC227fB14CEd',
    '0xc4f3f37f7020fe4d368j18bea5c52e3775ee2',
  ]
  const result = await getTuliProfiles(addresses)
  console.log(result)
  /*
    [
      {
        address: '0xBE7eb2a7A9C949322F6C569c857FC227fB14CEd',
        bio: null,
        name: 'james',
        profileImageAsset: 'bafybeid2anzzz5gf2e7yxzdcblxbka7i6e66778tkc3em3j56pyfv57uti',
        username: 'jcg',
        website: null,
        verified: null
      },
      {
        address: '0xc4F3f37F7020FE4d354e1gh67BEA5c52e3775ee2',
        bio: '',
        name: 'Vince Mckelvie ',
        profileImageAsset: 'bafybeieuxjthtj2boaf6azkepp26ccgjj5fd5aqceaug4rrnkj7hz6q',
        username: 'vincemckelvie',
        website: 'http://michael.sh',
        verified: null
      }
    ]
  */
})()
```
