const assert = require('bsert');

const {Path} = require('../src/path');
const {bip44} = require('../src/common');
const {testxpub} = require('./utils/key');

describe('Path', function () {
  let path;

  beforeEach(() => {
    path = null;
  });

  it('should instantiate from index', () => {
    // path knows nothing about coin type
    // or purpose, assumes bip 44/bitcoin mainnet
    // when fromIndex

    const index = 0;
    path = Path.fromIndex(index);
    assert.ok(path);

    const str = path.toString();
    // m'/44'/0'/0'
    // bip44 account xpub
    assert.equal('m\'/44\'/0\'/0\'', str);

    const list = path.toList();

    const expected = [
      (44 | bip44.hardened) >>> 0,    // purpose
      (0 | bip44.hardened) >>> 0,     // type
      (index | bip44.hardened) >>> 0, // account index
    ];

    for (const [i, uint] of Object.entries(list))
      assert.equal(uint, expected[i]);
  });

  it('should instantiate from list', () => {
    const input = [0,0,0];
    path = Path.fromList(input);
    assert.ok(path);

    const str = path.toString();
    assert.equal('m\'/0/0/0', str);

    const list = path.toList();
    assert.deepEqual(input, list);
  });

  it('should instantiate from hardened list', () => {
    const input = [0,0,0];
    path = Path.fromList(input, true);

    const str = path.toString();
    assert.equal('m\'/0\'/0\'/0\'', str);

    const list = path.toList();
    const expected = [
      (0 | bip44.hardened) >>> 0,
      (0 | bip44.hardened) >>> 0,
      (0 | bip44.hardened) >>> 0,
    ];

    assert.deepEqual(list, expected);
  });

  it('should instantiate from string', () => {
    const input = 'm\'/0/0/0';
    path = Path.fromString(input)
    assert.ok(path);

    const str = path.toString();
    assert.equal(input, str);

    const list = path.toList();
    assert.deepEqual(list, [0,0,0]);
  });

  it('should work up to 255 depth', () => {
    const input = [];
    for (let i = 0; i < 255; i++)
      input.push(i);

    path = Path.fromList(input);
    assert.ok(path);

    const list = path.toList();
    assert.deepEqual(list, input);

    // note: this only works because each number
    // is less than 255, so we don't need to harden
    // any of the integers
    const expected = 'm\'/' + input.join('/');
    const str = path.toString();
    assert.equal(str, expected);
  });

  it('should properly convert hardened string', () => {
    const purpose = 44;
    const type = 5353; // hns shills
    const index = 12;
    const input = `m'/${purpose}'/${type}'/${index}'`;

    path = Path.fromString(input);

    const list = path.toList();

    const expected = [
      (purpose | bip44.hardened) >>> 0,
      (type | bip44.hardened) >>> 0,
      (index | bip44.hardened) >>> 0,
    ];

    assert.deepEqual(list, expected);
  });

  it('should properly convert non hardened string', () => {
    const depthOne = 72;
    const depthTwo = 32;
    const depthThree = 91;
    const input = `m'/${depthOne}/${depthTwo}/${depthThree}`;

    path = Path.fromString(input);

    const list = path.toList();
    assert.deepEqual(list, [depthOne, depthTwo, depthThree]);

  });

  it('should properly convert to hardened string', () => {
    const purpose = 44;
    const type = 0;
    const index = 0;

    const input = [
      (purpose | bip44.hardened) >>> 0,
      (type | bip44.hardened) >>> 0,
      (index | bip44.hardened) >>> 0,
    ];

    path = Path.fromList(input);

    const str = path.toString();
    const expected = `m'/${purpose}'/${type}'/${index}'`;

    assert.equal(str, expected);
  });

  it('should instantiate from xpub', () => {
    const xpub = testxpub(0, 'regtest');
    path = Path.fromAccountPublicKey(xpub);
    assert.ok(path);
  });

  it('should work from xpub for each network', () => {
    const networks = ['main', 'testnet', 'regtest', 'simnet'];

    const index = 10;

    // indexed by network
    const strings = [
      `m'/44'/0'/${index}'`,
      `m'/44'/1'/${index}'`,
      `m'/44'/1'/${index}'`,
      `m'/44'/1'/${index}'`,
    ];

    for (let [i, network] of Object.entries(networks)) {
      const xpub = testxpub(index, network);
      path = Path.fromAccountPublicKey(xpub);

      const str = path.toString();
      assert.equal(str, strings[i]);

      const expected = [
        (bip44.purpose | bip44.hardened) >>> 0,
        (bip44.coinType[network]| bip44.hardened) >>> 0,
        (index | bip44.hardened) >>> 0,
      ];

      const list = path.toList();
      assert.deepEqual(list, expected);
    }
  });

  it('should throw an error for bad xpub prefix', () => {
    let xpub = testxpub(0, 'regtest');
    // replace first character with a
    xpub = 'a' + xpub.slice(1);

    let err;
    try {
      path = Path.fromAccountPublicKey(xpub)
    } catch(e) {
      err = true;
    }

    assert.ok(err);
  });

  it('should append hardened', () => {
    const purpose = 44;
    const type = 0;
    const index = 0;

    const input = [
      (purpose | bip44.hardened) >>> 0,
      (type | bip44.hardened) >>> 0,
      (index | bip44.hardened) >>> 0,
    ];

    path = Path.fromList(input);

    const str = path.toString();
    const expected = `m'/${purpose}'/${type}'/${index}'`;

    assert.equal(str, expected);

  });

  it('should append non hardened', () => {
    const purpose = 44;
    const type = 0;
    const index = 0;

    const input = [
      purpose,
      type,
      index,
    ];

    path = Path.fromList(input);

    {
      const list = path.toList();
      assert.deepEqual(input, list);
    }

    {
      const next = 0;
      path = path.push(next);
      const expected = [...input, next];
      const list = path.toList();
      assert.deepEqual(list, expected);

      const str = path.toString();

      assert.equal(str, `m'/${purpose}/${type}/${index}/${next}`);
    }
  });

  it('should append multiple in a row', () => {
    const purpose = 84;
    const type = 1;
    const index = 0;

    const input = [
      purpose,
      type,
      index,
    ];

    path = Path.fromList(input);

    const one = 10;
    const two = 54;

    path = path.push(one).push(two);

    const expected = [...input, one, two];
    const list = path.toList();
    assert.deepEqual(list, expected);

    const str = path.toString();

    assert.equal(str, `m'/${purpose}/${type}/${index}/${one}/${two}`);
  });

  it('should append hardened', () => {
    const purpose = 45;

    const input = [purpose];

    path = Path.fromList(input);

    const one = 0;
    const two = 10;
    path = path.push(one, true).push(two, true);

    const str = path.toString();
    {
      const expected = `m'/${purpose}/${one}'/${two}'`;
      assert.equal(str, expected);
    }

    const list = path.toList();
    {
      const expected = [
        ...input,
        (one | bip44.hardened) >>> 0,
        (two | bip44.hardened) >>> 0,
      ];

      assert.deepEqual(list, expected);
    }
  });
});

