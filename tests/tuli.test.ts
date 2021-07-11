import {
  Ask,
  Bid,
  BidShares,
  constructAsk,
  constructBid,
  constructBidShares,
  constructMediaData,
  Decimal,
  EIP712Signature,
  generateMetadata,
  MediaData,
  sha256FromBuffer,
  signMintWithSigMessage,
  signPermitMessage,
  Tuli,
} from '../src'
import { JsonRpcProvider } from '@ethersproject/providers'
import { Wallet } from '@ethersproject/wallet'
import { addresses as TuliAddresses } from '../src/addresses'
import { deployCurrency, setupTuli, TuliConfiguredAddresses } from './helpers'
import { Blockchain, generatedWallets } from '@tulilabs/core/dist/utils'
import { BigNumber, Bytes } from 'ethers'
import { formatUnits } from 'ethers/lib/utils'
import { AddressZero } from '@ethersproject/constants'
import { MediaFactory } from '@tulilabs/core/dist/typechain'
import MockAdapter from 'axios-mock-adapter'
import axios from 'axios'
import { promises as fs } from 'fs'

let provider = new JsonRpcProvider()
let blockchain = new Blockchain(provider)
jest.setTimeout(1000000)

describe('Tuli', () => {
  describe('#constructor', () => {
    it('throws an error if a mediaAddress is specified but not a marketAddress', () => {
      const wallet = Wallet.createRandom()
      expect(function () {
        new Tuli(wallet, 4, '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401')
      }).toThrow(
        'Tuli Constructor: mediaAddress and marketAddress must both be non-null or both be null'
      )
    })

    it('throws an error if the marketAddress is specified but not a mediaAddress', () => {
      const wallet = Wallet.createRandom()
      expect(function () {
        new Tuli(wallet, 4, '', '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401')
      }).toThrow(
        'Tuli Constructor: mediaAddress and marketAddress must both be non-null or both be null'
      )
    })

    it('throws an error if one of the market or media addresses in not a valid ethereum address', () => {
      const wallet = Wallet.createRandom()
      expect(function () {
        new Tuli(
          wallet,
          4,
          'not a valid ethereum address',
          '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401'
        )
      }).toThrow('Invariant failed: not a valid ethereum address is not a valid address')

      expect(function () {
        new Tuli(
          wallet,
          4,
          '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401',
          'not a valid ethereum address'
        )
      }).toThrow('Invariant failed: not a valid ethereum address is not a valid address')
    })

    it('throws an error if the chainId does not map to a network with deployed instance of the Tuli Protocol', () => {
      const wallet = Wallet.createRandom()

      expect(function () {
        new Tuli(wallet, 50)
      }).toThrow(
        'Invariant failed: chainId 50 not officially supported by the Tuli Protocol'
      )
    })

    it('throws an error if the chainId does not map to a network with deployed instance of the Tuli Protocol', () => {
      const wallet = Wallet.createRandom()

      expect(function () {
        new Tuli(
          wallet,
          50,
          '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401',
          '0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48'
        )
      }).not.toThrow(
        'Invariant failed: chainId 50 not officially supported by the Tuli Protocol'
      )
    })

    it('sets the Tuli instance to readOnly = false if a signer is specified', () => {
      const wallet = Wallet.createRandom()

      const tuli = new Tuli(
        wallet,
        50,
        '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401',
        '0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48'
      )
      expect(tuli.readOnly).toBe(false)
    })

    it('sets the Tuli instance to readOnly = true if a signer is specified', () => {
      const provider = new JsonRpcProvider()

      const tuli = new Tuli(
        provider,
        50,
        '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401',
        '0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48'
      )
      expect(tuli.readOnly).toBe(true)
    })

    it('initializes a Tuli instance with the checksummed media and market address for the specified chainId', () => {
      const wallet = Wallet.createRandom()
      const rinkebyMediaAddress = TuliAddresses['rinkeby'].media
      const rinkebyMarketAddress = TuliAddresses['rinkeby'].market
      const tuli = new Tuli(wallet, 4)
      expect(tuli.marketAddress).toBe(rinkebyMarketAddress)
      expect(tuli.mediaAddress).toBe(rinkebyMediaAddress)
      expect(tuli.market.address).toBe(rinkebyMarketAddress)
      expect(tuli.media.address).toBe(rinkebyMediaAddress)
    })

    it('initializes a Tuli instance with the specified media and market address if they are passed in', () => {
      const wallet = Wallet.createRandom()
      const mediaAddress = '0x1D7022f5B17d2F8B695918FB48fa1089C9f85401'
      const marketAddress = '0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48'

      const tuli = new Tuli(wallet, 50, mediaAddress, marketAddress)
      expect(tuli.readOnly).toBe(false)
      expect(tuli.marketAddress).toBe(marketAddress)
      expect(tuli.mediaAddress).toBe(mediaAddress)
      expect(tuli.market.address).toBe(marketAddress)
      expect(tuli.media.address).toBe(mediaAddress)

      const tuli1 = new Tuli(wallet, 50, mediaAddress, marketAddress)
      expect(tuli1.readOnly).toBe(false)
      expect(tuli1.marketAddress).toBe(marketAddress)
      expect(tuli1.mediaAddress).toBe(mediaAddress)
      expect(tuli1.market.address).toBe(marketAddress)
      expect(tuli1.media.address).toBe(mediaAddress)
    })
  })

  describe('contract functions', () => {
    let tuliConfig: TuliConfiguredAddresses
    let provider = new JsonRpcProvider()
    let [mainWallet, otherWallet] = generatedWallets(provider)
    //let mainWallet = generatedWallets(provider)[0]

    beforeEach(async () => {
      await blockchain.resetAsync()
      tuliConfig = await setupTuli(mainWallet, [otherWallet])
    })

    /******************
     * Write Functions
     ******************
     */

    describe('Write Functions', () => {
      let contentHash: string
      let contentHashBytes: Bytes
      let metadataHash: string
      let metadataHashBytes: Bytes
      let metadata: any
      let minifiedMetadata: string

      let defaultMediaData: MediaData
      let defaultBidShares: BidShares
      let defaultAsk: Ask
      let defaultBid: Bid
      let eipSig: EIP712Signature

      beforeEach(() => {
        metadata = {
          version: 'tuli-20210101',
          name: 'blah blah',
          description: 'blah blah blah',
          mimeType: 'text/plain',
        }
        minifiedMetadata = generateMetadata(metadata.version, metadata)
        metadataHash = sha256FromBuffer(Buffer.from(minifiedMetadata))
        contentHash = sha256FromBuffer(Buffer.from('invert'))

        defaultMediaData = constructMediaData(
          'https://example.com',
          'https://metadata.com',
          contentHash,
          metadataHash
        )
        defaultBidShares = constructBidShares(10, 90, 0)
        defaultAsk = constructAsk(tuliConfig.currency, Decimal.new(100).value)
        defaultBid = constructBid(
          tuliConfig.currency,
          Decimal.new(99).value,
          otherWallet.address,
          otherWallet.address,
          10
        )

        eipSig = {
          deadline: 1000,
          v: 0,
          r: '0x00',
          s: '0x00',
        }
      })

      describe('#updateContentURI', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.updateContentURI(0, 'new uri')).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('throws an error if the tokenURI does not begin with `https://`', async () => {
          const tuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          await tuli.mint(defaultMediaData, defaultBidShares)
          await expect(tuli.updateContentURI(0, 'http://example.com')).rejects.toBe(
            'Invariant failed: http://example.com must begin with `https://`'
          )
        })

        it('updates the content uri', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)

          const tokenURI = await mainTuli.fetchContentURI(0)
          expect(tokenURI).toEqual(defaultMediaData.tokenURI)

          await mainTuli.updateContentURI(0, 'https://newURI.com')

          const newTokenURI = await mainTuli.fetchContentURI(0)
          expect(newTokenURI).toEqual('https://newURI.com')
        })
      })

      describe('#updateMetadataURI', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.updateMetadataURI(0, 'new uri')).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('throws an error if the metadataURI does not begin with `https://`', async () => {
          const tuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          await tuli.mint(defaultMediaData, defaultBidShares)
          await expect(tuli.updateMetadataURI(0, 'http://example.com')).rejects.toBe(
            'Invariant failed: http://example.com must begin with `https://`'
          )
        })

        it('updates the metadata uri', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)

          const metadataURI = await mainTuli.fetchMetadataURI(0)
          expect(metadataURI).toEqual(defaultMediaData.metadataURI)

          await mainTuli.updateMetadataURI(0, 'https://newMetadataURI.com')

          const newMetadataURI = await mainTuli.fetchMetadataURI(0)
          expect(newMetadataURI).toEqual('https://newMetadataURI.com')
        })
      })

      describe('#mint', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.mint(defaultMediaData, defaultBidShares)).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('throws an error if bid shares do not sum to 100', async () => {
          const tuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          const invalidBidShares = {
            prevOwner: Decimal.new(10),
            owner: Decimal.new(70),
            creator: Decimal.new(10),
          }
          expect(tuli.readOnly).toBe(false)

          await expect(tuli.mint(defaultMediaData, invalidBidShares)).rejects.toBe(
            'Invariant failed: The BidShares sum to 90000000000000000000, but they must sum to 100000000000000000000'
          )
        })

        it('throws an error if the tokenURI does not begin with `https://`', async () => {
          const tuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          const invalidMediaData = {
            tokenURI: 'http://example.com',
            metadataURI: 'https://metadata.com',
            contentHash: contentHashBytes,
            metadataHash: metadataHashBytes,
          }
          expect(tuli.readOnly).toBe(false)

          await expect(tuli.mint(invalidMediaData, defaultBidShares)).rejects.toBe(
            'Invariant failed: http://example.com must begin with `https://`'
          )
        })

        it('throws an error if the metadataURI does not begin with `https://`', async () => {
          const tuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          const invalidMediaData = {
            tokenURI: 'https://example.com',
            metadataURI: 'http://metadata.com',
            contentHash: contentHashBytes,
            metadataHash: metadataHashBytes,
          }
          expect(tuli.readOnly).toBe(false)

          await expect(tuli.mint(invalidMediaData, defaultBidShares)).rejects.toBe(
            'Invariant failed: http://metadata.com must begin with `https://`'
          )
        })

        it('pads the gas limit by 10%', async () => {
          const otherTuliConfig = await setupTuli(otherWallet, [mainWallet])
          const tuliMedia = MediaFactory.connect(tuliConfig.media, mainWallet)
          const tx = await tuliMedia.mint(defaultMediaData, defaultBidShares)
          const otherTuli = new Tuli(
            otherWallet,
            50,
            otherTuliConfig.media,
            otherTuliConfig.market
          )
          const paddedTx = await otherTuli.mint(defaultMediaData, defaultBidShares)

          expect(paddedTx.gasLimit).toEqual(tx.gasLimit.mul(110).div(100))
        })

        it('creates a new piece of media', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          const totalSupply = await mainTuli.fetchTotalMedia()
          expect(totalSupply.toNumber()).toEqual(0)

          await mainTuli.mint(defaultMediaData, defaultBidShares)

          const owner = await mainTuli.fetchOwnerOf(0)
          const creator = await mainTuli.fetchCreator(0)
          const onChainContentHash = await mainTuli.fetchContentHash(0)
          const onChainMetadataHash = await mainTuli.fetchMetadataHash(0)

          const onChainBidShares = await mainTuli.fetchCurrentBidShares(0)
          const onChainContentURI = await mainTuli.fetchContentURI(0)
          const onChainMetadataURI = await mainTuli.fetchMetadataURI(0)

          expect(owner.toLowerCase()).toBe(mainWallet.address.toLowerCase())
          expect(creator.toLowerCase()).toBe(mainWallet.address.toLowerCase())
          expect(onChainContentHash).toBe(contentHash)
          expect(onChainContentURI).toBe(defaultMediaData.tokenURI)
          expect(onChainMetadataURI).toBe(defaultMediaData.metadataURI)
          expect(onChainMetadataHash).toBe(metadataHash)
          expect(onChainBidShares.creator.value).toEqual(defaultBidShares.creator.value)
          expect(onChainBidShares.owner.value).toEqual(defaultBidShares.owner.value)
          expect(onChainBidShares.prevOwner.value).toEqual(
            defaultBidShares.prevOwner.value
          )
        })
      })

      describe('#mintWithSig', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(
            tuli.mintWithSig(
              otherWallet.address,
              defaultMediaData,
              defaultBidShares,
              eipSig
            )
          ).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('throws an error if bid shares do not sum to 100', async () => {
          const tuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          const invalidBidShares = {
            prevOwner: Decimal.new(10),
            owner: Decimal.new(70),
            creator: Decimal.new(10),
          }
          expect(tuli.readOnly).toBe(false)

          await expect(
            tuli.mintWithSig(
              otherWallet.address,
              defaultMediaData,
              invalidBidShares,
              eipSig
            )
          ).rejects.toBe(
            'Invariant failed: The BidShares sum to 90000000000000000000, but they must sum to 100000000000000000000'
          )
        })

        it('throws an error if the tokenURI does not begin with `https://`', async () => {
          const tuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          const invalidMediaData = {
            tokenURI: 'http://example.com',
            metadataURI: 'https://metadata.com',
            contentHash: contentHashBytes,
            metadataHash: metadataHashBytes,
          }
          expect(tuli.readOnly).toBe(false)

          await expect(
            tuli.mintWithSig(
              otherWallet.address,
              invalidMediaData,
              defaultBidShares,
              eipSig
            )
          ).rejects.toBe(
            'Invariant failed: http://example.com must begin with `https://`'
          )
        })

        it('throws an error if the metadataURI does not begin with `https://`', async () => {
          const tuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          const invalidMediaData = {
            tokenURI: 'https://example.com',
            metadataURI: 'http://metadata.com',
            contentHash: contentHashBytes,
            metadataHash: metadataHashBytes,
          }
          expect(tuli.readOnly).toBe(false)

          await expect(tuli.mint(invalidMediaData, defaultBidShares)).rejects.toBe(
            'Invariant failed: http://metadata.com must begin with `https://`'
          )
        })

        it('creates a new piece of media', async () => {
          const otherTuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          const deadline = Math.floor(new Date().getTime() / 1000) + 60 * 60 * 24 // 24 hours
          const domain = otherTuli.eip712Domain()
          const nonce = await otherTuli.fetchMintWithSigNonce(mainWallet.address)
          const eipSig = await signMintWithSigMessage(
            mainWallet,
            contentHash,
            metadataHash,
            Decimal.new(10).value,
            nonce.toNumber(),
            deadline,
            domain
          )

          const totalSupply = await otherTuli.fetchTotalMedia()
          expect(totalSupply.toNumber()).toEqual(0)

          await otherTuli.mintWithSig(
            mainWallet.address,
            defaultMediaData,
            defaultBidShares,
            eipSig
          )

          const owner = await otherTuli.fetchOwnerOf(0)
          const creator = await otherTuli.fetchCreator(0)
          const onChainContentHash = await otherTuli.fetchContentHash(0)
          const onChainMetadataHash = await otherTuli.fetchMetadataHash(0)

          const onChainBidShares = await otherTuli.fetchCurrentBidShares(0)
          const onChainContentURI = await otherTuli.fetchContentURI(0)
          const onChainMetadataURI = await otherTuli.fetchMetadataURI(0)

          expect(owner.toLowerCase()).toBe(mainWallet.address.toLowerCase())
          expect(creator.toLowerCase()).toBe(mainWallet.address.toLowerCase())
          expect(onChainContentHash).toBe(contentHash)
          expect(onChainContentURI).toBe(defaultMediaData.tokenURI)
          expect(onChainMetadataURI).toBe(defaultMediaData.metadataURI)
          expect(onChainMetadataHash).toBe(metadataHash)
          expect(onChainBidShares.creator.value).toEqual(defaultBidShares.creator.value)
          expect(onChainBidShares.owner.value).toEqual(defaultBidShares.owner.value)
          expect(onChainBidShares.prevOwner.value).toEqual(
            defaultBidShares.prevOwner.value
          )
        })
      })

      describe('#setAsk', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.setAsk(0, defaultAsk)).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('sets an ask for a piece of media', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)

          await mainTuli.setAsk(0, defaultAsk)

          const onChainAsk = await mainTuli.fetchCurrentAsk(0)
          expect(onChainAsk.currency.toLowerCase()).toEqual(
            defaultAsk.currency.toLowerCase()
          )
          expect(parseFloat(formatUnits(onChainAsk.amount, 'wei'))).toEqual(
            parseFloat(formatUnits(defaultAsk.amount, 'wei'))
          )
        })
      })

      describe('#setBid', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.setBid(0, defaultBid)).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('creates a new bid on chain', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)

          const otherTuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          const nullOnChainBid = await otherTuli.fetchCurrentBidForBidder(
            0,
            otherWallet.address
          )

          expect(nullOnChainBid.currency).toEqual(AddressZero)

          await otherTuli.setBid(0, defaultBid)
          const onChainBid = await otherTuli.fetchCurrentBidForBidder(
            0,
            otherWallet.address
          )

          expect(parseFloat(formatUnits(onChainBid.amount, 'wei'))).toEqual(
            parseFloat(formatUnits(onChainBid.amount, 'wei'))
          )
          expect(onChainBid.currency.toLowerCase()).toEqual(
            defaultBid.currency.toLowerCase()
          )
          expect(onChainBid.bidder.toLowerCase()).toEqual(defaultBid.bidder.toLowerCase())
          expect(onChainBid.recipient.toLowerCase()).toEqual(
            defaultBid.recipient.toLowerCase()
          )
          expect(onChainBid.sellOnShare.value).toEqual(defaultBid.sellOnShare.value)
        })
      })

      describe('#removeAsk', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.removeAsk(0)).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('removes an ask', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)
          await mainTuli.setAsk(0, defaultAsk)

          const onChainAsk = await mainTuli.fetchCurrentAsk(0)
          expect(onChainAsk.currency.toLowerCase()).toEqual(
            defaultAsk.currency.toLowerCase()
          )

          await mainTuli.removeAsk(0)

          const nullOnChainAsk = await mainTuli.fetchCurrentAsk(0)
          expect(nullOnChainAsk.currency).toEqual(AddressZero)
        })
      })

      describe('#removeBid', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.removeBid(0)).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('removes a bid', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)
          const otherTuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          await otherTuli.setBid(0, defaultBid)
          const onChainBid = await otherTuli.fetchCurrentBidForBidder(
            0,
            otherWallet.address
          )

          expect(parseFloat(formatUnits(onChainBid.amount, 'wei'))).toEqual(
            parseFloat(formatUnits(onChainBid.amount, 'wei'))
          )
          expect(onChainBid.currency.toLowerCase()).toEqual(
            defaultBid.currency.toLowerCase()
          )
          expect(onChainBid.bidder.toLowerCase()).toEqual(defaultBid.bidder.toLowerCase())
          expect(onChainBid.recipient.toLowerCase()).toEqual(
            defaultBid.recipient.toLowerCase()
          )
          expect(onChainBid.sellOnShare.value).toEqual(defaultBid.sellOnShare.value)

          await otherTuli.removeBid(0)

          const nullOnChainBid = await otherTuli.fetchCurrentBidForBidder(
            0,
            otherWallet.address
          )

          expect(nullOnChainBid.currency).toEqual(AddressZero)
        })
      })

      describe('#acceptBid', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.acceptBid(0, defaultBid)).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('accepts a bid', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)
          const otherTuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          await otherTuli.setBid(0, defaultBid)
          await mainTuli.acceptBid(0, defaultBid)
          const newOwner = await otherTuli.fetchOwnerOf(0)
          expect(newOwner.toLowerCase()).toEqual(otherWallet.address.toLowerCase())
        })
      })

      describe('#permit', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.permit(otherWallet.address, 0, eipSig)).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('grants approval to a different address', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)
          const otherTuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)

          const deadline = Math.floor(new Date().getTime() / 1000) + 60 * 60 * 24 // 24 hours
          const domain = mainTuli.eip712Domain()
          const eipSig = await signPermitMessage(
            mainWallet,
            otherWallet.address,
            0,
            0,
            deadline,
            domain
          )

          await otherTuli.permit(otherWallet.address, 0, eipSig)
          const approved = await otherTuli.fetchApproved(0)
          expect(approved.toLowerCase()).toBe(otherWallet.address.toLowerCase())
        })
      })

      describe('#revokeApproval', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.revokeApproval(0)).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it("revokes an addresses approval of another address's media", async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)
          await mainTuli.approve(otherWallet.address, 0)
          const approved = await mainTuli.fetchApproved(0)
          expect(approved.toLowerCase()).toBe(otherWallet.address.toLowerCase())

          const otherTuli = new Tuli(otherWallet, 50, tuliConfig.media, tuliConfig.market)
          await otherTuli.revokeApproval(0)
          const nullApproved = await mainTuli.fetchApproved(0)
          expect(nullApproved).toBe(AddressZero)
        })
      })

      describe('#burn', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.burn(0)).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('burns a piece of media', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)

          const owner = await mainTuli.fetchOwnerOf(0)
          expect(owner.toLowerCase()).toEqual(mainWallet.address.toLowerCase())

          const totalSupply = await mainTuli.fetchTotalMedia()
          expect(totalSupply.toNumber()).toEqual(1)

          await mainTuli.burn(0)

          const zeroSupply = await mainTuli.fetchTotalMedia()
          expect(zeroSupply.toNumber()).toEqual(0)
        })
      })

      describe('#approve', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.approve(otherWallet.address, 0)).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('grants approval for another address for a piece of media', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)
          const nullApproved = await mainTuli.fetchApproved(0)
          expect(nullApproved).toBe(AddressZero)
          await mainTuli.approve(otherWallet.address, 0)
          const approved = await mainTuli.fetchApproved(0)
          expect(approved.toLowerCase()).toBe(otherWallet.address.toLowerCase())
        })
      })

      describe('#setApprovalForAll', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(tuli.setApprovalForAll(otherWallet.address, true)).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('sets approval for another address for all media owned by owner', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)
          const notApproved = await mainTuli.fetchIsApprovedForAll(
            mainWallet.address,
            otherWallet.address
          )
          expect(notApproved).toBe(false)
          await mainTuli.setApprovalForAll(otherWallet.address, true)
          const approved = await mainTuli.fetchIsApprovedForAll(
            mainWallet.address,
            otherWallet.address
          )
          expect(approved).toBe(true)

          await mainTuli.setApprovalForAll(otherWallet.address, false)
          const revoked = await mainTuli.fetchIsApprovedForAll(
            mainWallet.address,
            otherWallet.address
          )
          expect(revoked).toBe(false)
        })
      })

      describe('#transferFrom', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(
            tuli.transferFrom(mainWallet.address, otherWallet.address, 0)
          ).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })

        it('transfers media to another address', async () => {
          const mainTuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await mainTuli.mint(defaultMediaData, defaultBidShares)
          const owner = await mainTuli.fetchOwnerOf(0)
          expect(owner.toLowerCase()).toEqual(mainWallet.address.toLowerCase())

          await mainTuli.transferFrom(mainWallet.address, otherWallet.address, 0)
          const newOwner = await mainTuli.fetchOwnerOf(0)
          expect(newOwner.toLowerCase()).toEqual(otherWallet.address.toLowerCase())
        })
      })

      describe('#safeTransferFrom', () => {
        it('throws an error if called on a readOnly Tuli instance', async () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          expect(tuli.readOnly).toBe(true)

          await expect(
            tuli.safeTransferFrom(mainWallet.address, otherWallet.address, 0)
          ).rejects.toBe(
            'ensureNotReadOnly: readOnly Tuli instance cannot call contract methods that require a signer.'
          )
        })
      })

      describe('#eip712Domain', () => {
        it('returns chainId 1 on a local blockchain', () => {
          const provider = new JsonRpcProvider()

          const tuli = new Tuli(provider, 50, tuliConfig.media, tuliConfig.market)
          const domain = tuli.eip712Domain()
          expect(domain.chainId).toEqual(1)
          expect(domain.verifyingContract.toLowerCase()).toEqual(
            tuli.mediaAddress.toLowerCase()
          )
        })

        it('returns the tuli chainId', () => {
          const provider = new JsonRpcProvider()
          const tuli = new Tuli(provider, 4, tuliConfig.media, tuliConfig.market)
          const domain = tuli.eip712Domain()

          expect(domain.chainId).toEqual(4)
          expect(domain.verifyingContract.toLowerCase()).toEqual(
            tuli.mediaAddress.toLowerCase()
          )
        })
      })

      describe('#isValidBid', () => {
        it('returns true if the bid amount can be evenly split by current bidShares', async () => {
          const tuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await tuli.mint(defaultMediaData, defaultBidShares)
          const isValid = await tuli.isValidBid(0, defaultBid)
          expect(isValid).toEqual(true)
        })

        it('returns false if the bid amount cannot be evenly split by current bidShares', async () => {
          const cur = await deployCurrency(mainWallet, 'CUR', 'CUR', 2)
          const tuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          const bid = constructBid(
            cur,
            BigNumber.from(200),
            otherWallet.address,
            otherWallet.address,
            10
          )

          const preciseBidShares = {
            creator: Decimal.new(33.3333),
            owner: Decimal.new(33.3333),
            prevOwner: Decimal.new(33.3334),
          }

          await tuli.mint(defaultMediaData, preciseBidShares)
          const isValid = await tuli.isValidBid(0, bid)
          expect(isValid).toEqual(false)
        })

        it('returns false if the sell on share is invalid', async () => {
          const tuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await tuli.mint(defaultMediaData, defaultBidShares)

          const bid = constructBid(
            tuliConfig.currency,
            BigNumber.from(200),
            otherWallet.address,
            otherWallet.address,
            90.1
          )

          const isValid = await tuli.isValidBid(0, bid)
          expect(isValid).toEqual(false)
        })
      })

      describe('#isValidAsk', () => {
        it('returns true if the ask amount can be evenly split by current bidShares', async () => {
          const tuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await tuli.mint(defaultMediaData, defaultBidShares)
          const isValid = await tuli.isValidAsk(0, defaultAsk)
          expect(isValid).toEqual(true)
        })

        it('returns false if the ask amount cannot be evenly split by current bidShares', async () => {
          const cur = await deployCurrency(mainWallet, 'CUR', 'CUR', 2)
          const tuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          const ask = constructAsk(cur, BigNumber.from(200))

          const preciseBidShares = {
            creator: Decimal.new(33.3333),
            owner: Decimal.new(33.3333),
            prevOwner: Decimal.new(33.3334),
          }

          await tuli.mint(defaultMediaData, preciseBidShares)
          const isValid = await tuli.isValidAsk(0, ask)
          expect(isValid).toEqual(false)
        })
      })

      describe('#isVerifiedMedia', () => {
        it('returns true if the media is verified', async () => {
          const tuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          const mock = new MockAdapter(axios)
          const helloWorldBuf = await fs.readFile('./fixtures/HelloWorld.txt')
          const helloWorldURI =
            'https://ipfs/io/ipfs/Qmf1rtki74jvYmGeqaaV51hzeiaa6DyWc98fzDiuPatzyy'
          const kanyeBuf = await fs.readFile('./fixtures/kanye.jpg')
          const kanyeURI =
            'https://ipfs.io/ipfs/QmRhK7o7gpjkkpubu9EvqDGJEgY1nQxSkP7XsMcaX7pZwV'

          mock.onGet(kanyeURI).reply(200, kanyeBuf)
          mock.onGet(helloWorldURI).reply(200, helloWorldBuf)

          const mediaData = constructMediaData(
            kanyeURI,
            helloWorldURI,
            sha256FromBuffer(kanyeBuf),
            sha256FromBuffer(helloWorldBuf)
          )
          await tuli.mint(mediaData, defaultBidShares)

          const verified = await tuli.isVerifiedMedia(0)
          expect(verified).toEqual(true)
        })

        it('returns false if the media is not verified', async () => {
          const tuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          const mock = new MockAdapter(axios)
          const helloWorldBuf = await fs.readFile('./fixtures/HelloWorld.txt')
          const helloWorldURI =
            'https://ipfs/io/ipfs/Qmf1rtki74jvYmGeqaaV51hzeiaa6DyWc98fzDiuPatzyy'
          const kanyeBuf = await fs.readFile('./fixtures/kanye.jpg')
          const kanyeURI =
            'https://ipfs.io/ipfs/QmRhK7o7gpjkkpubu9EvqDGJEgY1nQxSkP7XsMcaX7pZwV'

          mock.onGet(kanyeURI).reply(200, kanyeBuf)
          mock.onGet(helloWorldURI).reply(200, kanyeBuf) // this will cause verification to fail!

          const mediaData = constructMediaData(
            kanyeURI,
            helloWorldURI,
            sha256FromBuffer(kanyeBuf),
            sha256FromBuffer(helloWorldBuf)
          )
          await tuli.mint(mediaData, defaultBidShares)

          const verified = await tuli.isVerifiedMedia(0)
          expect(verified).toEqual(false)
        })

        it('rejects the promise if the media does not exist', async () => {
          const tuli = new Tuli(mainWallet, 50, tuliConfig.media, tuliConfig.market)
          await expect(tuli.isVerifiedMedia(0)).rejects.toContain(
            'token with that id does not exist'
          )
        })
      })
    })
  })
})
