import { RetrievedReference } from '@aws-sdk/client-bedrock-agent-runtime';
import {
  buildBedrockKbReferenceTarget,
  buildBedrockKbSnippet,
  formatBedrockKbFootnote,
  resolveBedrockKbDocumentLabel,
} from '../../../lambda/utils/bedrockKbCitation';

describe('Bedrock Knowledge Base citation', () => {
  test('formats PDF page index 2 as page 3 in the label and URL', () => {
    const ref: RetrievedReference = {
      // eslint-disable-next-line i18nhelper/no-jp-string
      content: { type: 'TEXT', text: 'ラックCは38.6°Cで、高温箇所は上部。' },
      location: {
        type: 'S3',
        s3Location: {
          uri: 's3://example-bucket/docs/genu-advanced-parsing-ja-sample.pdf',
        },
      },
      metadata: {
        'x-amz-bedrock-kb-document-page-number': 2.0,
      },
    };

    const target = buildBedrockKbReferenceTarget(
      ref,
      'https://s3.ap-northeast-1.amazonaws.com/example-bucket/docs/genu-advanced-parsing-ja-sample.pdf'
    );

    // An unsplit PDF keeps its own URL and physical page number.
    expect(target).toEqual({
      pageNumber: 3,
      displayPageNumber: 3,
      url: 'https://s3.ap-northeast-1.amazonaws.com/example-bucket/docs/genu-advanced-parsing-ja-sample.pdf#page=3',
    });
    expect(
      formatBedrockKbFootnote({
        refId: 0,
        displayTitle: 'genu-advanced-parsing-ja-sample',
        target,
      })
    ).toBe(
      '\n[^0]: [genu-advanced-parsing-ja-sample(3 page)](https://s3.ap-northeast-1.amazonaws.com/example-bucket/docs/genu-advanced-parsing-ja-sample.pdf#page=3)'
    );
  });

  test('does not add a PDF page fragment to a web source', () => {
    const ref: RetrievedReference = {
      location: {
        type: 'WEB',
        webLocation: { url: 'https://example.com/document' },
      },
      metadata: {
        'x-amz-bedrock-kb-document-page-number': 2.0,
      },
    };

    const target = buildBedrockKbReferenceTarget(
      ref,
      'https://example.com/document'
    );

    expect(target).toEqual({ url: 'https://example.com/document' });
    expect(
      formatBedrockKbFootnote({
        refId: 1,
        displayTitle: 'example.com/document',
        target,
      })
    ).toBe('\n[^1]: [example.com/document](https://example.com/document)');
  });

  test('points a split part at the integrated PDF on the original page', () => {
    const ref: RetrievedReference = {
      location: {
        type: 'S3',
        s3Location: {
          uri: 's3://example-bucket/docs/OPS-MANUAL-001/manual_p0051-0100.pdf',
        },
      },
      metadata: {
        'x-amz-bedrock-kb-document-page-number': 22.0,
        original_page_start: 51,
        original_page_end: 100,
        part_number: 2,
        // eslint-disable-next-line i18nhelper/no-jp-string
        document_title: '設備障害対応マニュアル',
        // eslint-disable-next-line i18nhelper/no-jp-string
        original_file_name: '設備障害対応マニュアル.pdf',
      },
    };

    const target = buildBedrockKbReferenceTarget(
      ref,
      'https://s3.ap-northeast-1.amazonaws.com/example-bucket/docs/OPS-MANUAL-001/manual_p0051-0100.pdf'
    );

    // Page 23 inside part 2 is page 73 of the original document. The link opens
    // the integrated PDF under originals/ at the original physical page so that
    // the viewer page indicator matches the label.
    expect(target.pageNumber).toBe(23);
    expect(target.displayPageNumber).toBe(73);
    expect(target.url).toBe(
      'https://s3.ap-northeast-1.amazonaws.com/example-bucket/originals/%E8%A8%AD%E5%82%99%E9%9A%9C%E5%AE%B3%E5%AF%BE%E5%BF%9C%E3%83%9E%E3%83%8B%E3%83%A5%E3%82%A2%E3%83%AB.pdf#page=73'
    );
    expect(
      formatBedrockKbFootnote({
        refId: 0,
        displayTitle: resolveBedrockKbDocumentLabel(ref) ?? '',
        target,
      })
    ).toBe(
      // eslint-disable-next-line i18nhelper/no-jp-string
      '\n[^0]: [設備障害対応マニュアル(73 page)](https://s3.ap-northeast-1.amazonaws.com/example-bucket/originals/%E8%A8%AD%E5%82%99%E9%9A%9C%E5%AE%B3%E5%AF%BE%E5%BF%9C%E3%83%9E%E3%83%8B%E3%83%A5%E3%82%A2%E3%83%AB.pdf#page=73)'
    );
  });

  test('keeps the split file link when the original file name is missing', () => {
    const ref: RetrievedReference = {
      location: {
        type: 'S3',
        s3Location: {
          uri: 's3://example-bucket/docs/OPS-MANUAL-001/manual_p0051-0100.pdf',
        },
      },
      metadata: {
        'x-amz-bedrock-kb-document-page-number': 0.0,
        original_page_start: 51,
        original_page_end: 100,
        part_number: 2,
      },
    };

    const target = buildBedrockKbReferenceTarget(
      ref,
      'https://s3.ap-northeast-1.amazonaws.com/example-bucket/docs/OPS-MANUAL-001/manual_p0051-0100.pdf'
    );

    // Without original_file_name the integrated PDF key cannot be built, so the
    // link falls back to the split file while the label still shows page 51.
    expect(target.displayPageNumber).toBe(51);
    expect(target.url).toBe(
      'https://s3.ap-northeast-1.amazonaws.com/example-bucket/docs/OPS-MANUAL-001/manual_p0051-0100.pdf#page=1'
    );
  });
});

describe('resolveBedrockKbDocumentLabel', () => {
  test('prefers document_title over the other metadata attributes', () => {
    expect(
      resolveBedrockKbDocumentLabel({
        metadata: {
          document_title: 'Equipment Incident Manual',
          title: 'Legacy Title',
          original_file_name: 'manual.pdf',
        },
      })
    ).toBe('Equipment Incident Manual');
  });

  test('falls back to the original file name without its extension', () => {
    expect(
      resolveBedrockKbDocumentLabel({
        metadata: { original_file_name: 'equipment-incident-manual.pdf' },
      })
    ).toBe('equipment-incident-manual');
  });

  test('returns undefined when no metadata label exists', () => {
    expect(resolveBedrockKbDocumentLabel({ metadata: {} })).toBeUndefined();
  });
});

describe('buildBedrockKbSnippet', () => {
  test('collapses whitespace and trims markdown noise into a short excerpt', () => {
    const ref: RetrievedReference = {
      content: {
        type: 'TEXT',
        text: '# Heading\n\n- item one\n- item two with a longer sentence that should be cut',
      },
    };

    expect(buildBedrockKbSnippet(ref, 30)).toBe(
      'Heading item one item two with…'
    );
  });

  test('returns the whole text when it is short enough', () => {
    expect(
      buildBedrockKbSnippet(
        { content: { type: 'TEXT', text: 'short excerpt' } },
        80
      )
    ).toBe('short excerpt');
  });

  test('strips characters that would break the footnote markdown', () => {
    expect(
      buildBedrockKbSnippet(
        { content: { type: 'TEXT', text: 'a `code` | b [x](y)' } },
        80
      )
    ).toBe('a code b x(y)');
  });

  test('returns undefined when there is no content text', () => {
    expect(buildBedrockKbSnippet({ metadata: {} }, 80)).toBeUndefined();
    expect(
      buildBedrockKbSnippet({ content: { type: 'TEXT', text: '   ' } }, 80)
    ).toBeUndefined();
  });
});

describe('formatBedrockKbFootnote with a snippet', () => {
  test('puts the excerpt on a new line after the link', () => {
    const target = {
      url: 'https://example.com/doc.pdf#page=3',
      pageNumber: 3,
      displayPageNumber: 3,
    };

    // The single newline renders as a line break (remark-breaks), so the
    // excerpt appears below the title link instead of running into it.
    expect(
      formatBedrockKbFootnote({
        refId: 2,
        displayTitle: 'Doc',
        target,
        snippet: 'an excerpt of the chunk',
      })
    ).toBe(
      '\n[^2]: [Doc(3 page)](https://example.com/doc.pdf#page=3)\nan excerpt of the chunk'
    );
  });
});
