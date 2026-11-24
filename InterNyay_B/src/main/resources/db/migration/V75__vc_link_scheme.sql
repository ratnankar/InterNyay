UPDATE judges
SET virtual_court_link = CONCAT('https://', TRIM(virtual_court_link))
WHERE virtual_court_link IS NOT NULL
  AND TRIM(virtual_court_link) <> ''
  AND TRIM(virtual_court_link) NOT REGEXP '^[A-Za-z][A-Za-z0-9+.-]*:';
