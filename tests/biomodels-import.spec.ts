import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { fetchBioModelsSbml, normalizeBioModelsId } from '../services/bioModelsImport';

const MINIMAL_SBML = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2/version4" level="2" version="4">
  <model id="m1"/>
</sbml>`;

describe('BioModels import service', () => {
  it('normalizes a numeric model id into BIOMD format', () => {
    expect(normalizeBioModelsId('59')).toBe('BIOMD0000000059');
  });

  it('fetches direct SBML XML from the preferred download endpoint', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(MINIMAL_SBML, {
        status: 200,
        headers: { 'content-type': 'text/xml' },
      });
    });

    const result = await fetchBioModelsSbml('biomd0000000059', mockFetch as unknown as typeof fetch);
    expect(result.normalizedId).toBe('BIOMD0000000059');
    expect(result.sbmlText).toContain('<sbml');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const firstCall = mockFetch.mock.calls[0] as unknown[];
    expect(String(firstCall[0])).toContain(
      '/model/download/BIOMD0000000059?filename=BIOMD0000000059_url.xml'
    );
  });

  it('extracts SBML from OMEX when response is explicitly marked as archive payload', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.xml',
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<omexManifest xmlns="http://identifiers.org/combine.specifications/omex-manifest">',
        '  <content location="./manifest.xml" format="http://identifiers.org/combine.specifications/omex-manifest"/>',
        '  <content location="./metadata.xml" format="http://identifiers.org/combine.specifications/omex-metadata"/>',
        '  <content location="./models/model.xml" format="http://identifiers.org/combine.specifications/sbml.level-3.version-2.core"/>',
        '</omexManifest>',
      ].join('\n')
    );
    zip.file('metadata.xml', '<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/>');
    zip.file('models/model.xml', MINIMAL_SBML.replace('id="m1"', 'id="m2"'));
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<!doctype html><html><body>login</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from(zipBytes), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        })
      );

    const result = await fetchBioModelsSbml('BIOMD0000000001', mockFetch as unknown as typeof fetch);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.sourceEntry).toBe('models/model.xml');
    expect(result.sbmlText).toContain('<sbml');
    expect(result.sbmlText).toContain('id="m2"');
  });

  it('does not fall back to arrayBuffer when non-archive text read fails', async () => {
    const textSpy = vi.fn(async () => {
      throw new Error('text read failed');
    });
    const arrayBufferSpy = vi.fn(async () => new ArrayBuffer(8));

    const mockFetch = vi.fn(async () => {
      const response = {
        ok: true,
        status: 200,
        url: 'https://example.org/model.xml',
        headers: new Headers({ 'content-type': 'text/xml' }),
        bodyUsed: false,
        text: textSpy,
        arrayBuffer: arrayBufferSpy,
      };
      return response as unknown as Response;
    });

    await expect(
      fetchBioModelsSbml('BIOMD0000000001', mockFetch as unknown as typeof fetch)
    ).rejects.toThrow(/text read failed/);
    expect(textSpy).toHaveBeenCalledTimes(2);
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });
});
