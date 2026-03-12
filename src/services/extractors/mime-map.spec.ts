import { mimeFromFilename } from './mime-map.js';

describe('mimeFromFilename', () => {
  it.each([
    ['report.pdf', 'application/pdf'],
    ['doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['page.html', 'text/html'],
    ['page.htm', 'text/html'],
    ['notes.txt', 'text/plain'],
    ['readme.md', 'text/markdown'],
    ['photo.png', 'image/png'],
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['photo.webp', 'image/webp'],
    ['photo.gif', 'image/gif'],
    ['scan.tiff', 'image/tiff'],
    ['scan.tif', 'image/tiff'],
    ['data.csv', 'text/csv'],
    ['config.json', 'application/json'],
    ['config.yaml', 'application/x-yaml'],
    ['config.yml', 'application/x-yaml'],
  ])('maps %s to %s', (filename, expected) => {
    expect(mimeFromFilename(filename)).toBe(expected);
  });

  it('is case-insensitive for extensions', () => {
    expect(mimeFromFilename('FILE.PDF')).toBe('application/pdf');
    expect(mimeFromFilename('image.JPG')).toBe('image/jpeg');
  });

  it('returns null for unknown extensions', () => {
    expect(mimeFromFilename('archive.rar')).toBeNull();
    expect(mimeFromFilename('binary.exe')).toBeNull();
  });

  it('returns null for files without extensions', () => {
    expect(mimeFromFilename('Makefile')).toBeNull();
    expect(mimeFromFilename('README')).toBeNull();
  });

  it('uses the last extension for double-extension filenames', () => {
    expect(mimeFromFilename('archive.tar.gz')).toBeNull();
    expect(mimeFromFilename('file.backup.pdf')).toBe('application/pdf');
  });
});
