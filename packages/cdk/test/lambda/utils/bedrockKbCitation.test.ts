import { RetrievedReference } from '@aws-sdk/client-bedrock-agent-runtime';
import {
  buildBedrockKbReferenceTarget,
  formatBedrockKbFootnote,
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

    expect(target).toEqual({
      pageNumber: 3,
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
});
