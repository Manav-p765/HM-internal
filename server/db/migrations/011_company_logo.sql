-- 011_company_logo: an optional company logo for the printed invoice (the old invoice generator printed one
-- in the header). Stored on the single company_settings row as a base64 data URL of a PNG, JPEG or WebP
-- image (never SVG, which can carry script); the API checks the type, the base64 and the file signature,
-- and limits the decoded image to 150 KB. The page shows it with <img src>, which the CSP already allows
-- (img-src data:). Only admins change it (PATCH /api/settings/company).
ALTER TABLE company_settings
  ADD COLUMN logo_data_url text
    CONSTRAINT company_settings_logo_check CHECK (
      logo_data_url IS NULL
      OR (logo_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' AND length(logo_data_url) <= 210000)
    );
