import {
  optionalNumberArg,
  parseArgs,
  requireArg,
} from '../../../tools/rag-docs/cli/args';

describe('parseArgs', () => {
  it('reads space separated and equals separated options', () => {
    expect(
      parseArgs(['--manifest', 'a.yaml', '--pages-per-part=25', '--dry-run'])
    ).toEqual({
      manifest: 'a.yaml',
      'pages-per-part': '25',
      'dry-run': 'true',
    });
  });

  it('ignores positional tokens that do not follow an option', () => {
    expect(parseArgs(['extra', '--input', 'a.pdf'])).toEqual({
      input: 'a.pdf',
    });
  });
});

describe('requireArg', () => {
  it('returns the value when it is present', () => {
    expect(requireArg({ input: 'a.pdf' }, 'input')).toBe('a.pdf');
  });

  it.each([
    ['missing', {}],
    ['used as a flag', { input: 'true' }],
  ])('throws when the option is %s', (_label, args) => {
    expect(() => requireArg(args, 'input')).toThrow(/--input is required/);
  });
});

describe('optionalNumberArg', () => {
  it('returns undefined when the option is absent', () => {
    expect(optionalNumberArg({}, 'pages-per-part')).toBeUndefined();
  });

  it('parses an integer', () => {
    expect(
      optionalNumberArg({ 'pages-per-part': '25' }, 'pages-per-part')
    ).toBe(25);
  });

  it('rejects a non integer', () => {
    expect(() =>
      optionalNumberArg({ 'pages-per-part': '2.5' }, 'pages-per-part')
    ).toThrow(/must be an integer/);
  });
});
