-- InterNyay courts + judge listings refresh (MySQL 8+)
-- Generated from the supplied Delhi District Courts PDFs.
-- BACK UP YOUR DATABASE BEFORE RUNNING. Run this file against the InterNyay database after the project Flyway migrations, including V9, V14, and V19.
-- Courts/district parent rows are assumed to exist from V2; this script does not recreate districts.
-- For source PDFs that state a room/building, those seats are added to `courts`; only explicitly stated floors are populated.
-- West and Patiala House PDFs do not give room/building/floor information, so existing room details for matched judges are preserved.
-- IMPORTANT: `East- karkardooma.pdf` is an exact duplicate of the North-West/Rohini PDF, so it is deliberately not loaded as East.
-- Recheck/replace it with the actual East/Karkardooma roster before updating that district.
-- Missing/odd serials are preserved as provided: South roster #55 and West roster #31 are absent, West row #66 repeats, and West has an additional Digital Traffic Court table.
-- North District PDF page 2, row 22 prints reader phone as 9920 8076 (8 digits); retained as printed for manual verification.

SET NAMES utf8mb4;
DROP TEMPORARY TABLE IF EXISTS tmp_court_roster;
CREATE TEMPORARY TABLE tmp_court_roster (
  source_file VARCHAR(255) NOT NULL,
  source_row VARCHAR(20) NOT NULL,
  court VARCHAR(100) NOT NULL,
  district VARCHAR(100) NOT NULL,
  court_no VARCHAR(50) NOT NULL DEFAULT '',
  building VARCHAR(50) NOT NULL DEFAULT '',
  floor VARCHAR(50) NOT NULL DEFAULT '',
  judge_name VARCHAR(255) NOT NULL,
  designation VARCHAR(255) NULL,
  court_reader_name VARCHAR(255) NULL,
  court_reader_phone VARCHAR(255) NULL,
  court_email VARCHAR(255) NULL,
  vc_meeting_id VARCHAR(255) NULL,
  virtual_court_link VARCHAR(1000) NULL,
  mahila_court BOOLEAN NOT NULL DEFAULT FALSE,
  KEY idx_tmp_roster_scope (court, district),
  KEY idx_tmp_roster_seat (court, district, building, floor, court_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tmp_court_roster (source_file, source_row, court, district, court_no, building, floor, judge_name, designation, court_reader_name, court_reader_phone, court_email, vc_meeting_id, virtual_court_link, mahila_court) VALUES
  ('North Delhi - Rohini.pdf', '1', 'Rohini', 'North', '404', '', '', 'Sh. Umed Singh', 'Principal District & Sessions Judge, North District', 'Sh. Sunil Dutt Kaushik', '8468824577', 'pdsj-north@ddc.nic.in', '1767264595', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north01', 0),
  ('North Delhi - Rohini.pdf', '2', 'Rohini', 'North', '307', '', '', 'Sh. Jagdish Kumar', 'District Judge (Commercial Court-01)', 'Ms. Neelam Chopra', '9013384126', 'djcomm-north@ddc.nic.in', '1767235661', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north02', 0),
  ('North Delhi - Rohini.pdf', '3', 'Rohini', 'North', '303', '', '', 'Sh. Mohd. Farrukh', 'Commercial Court-02', 'Sh. Mahesh Kumar', '9588179651', 'djcomm02-north@ddc.nic.in', '25199616694', 'https://districtcourtdelhi.webex.com/meet/djcomm02-north', 0),
  ('North Delhi - Rohini.pdf', '4', 'Rohini', 'North', '305', '', '', 'Sh. Sidharth Mathur', 'District Judge-01', 'Sh. Rajesh Kumar', '7840007826', 'adj01-north@ddc.nic.in', '1763463260', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north07', 0),
  ('North Delhi - Rohini.pdf', '5', 'Rohini', 'North', '314', '', '', 'Ms. Preeti Parewa', 'District Judge-02', 'Sh. Kamal Bandu Sharma', '8750547911', 'adj02-north@ddc.nic.in', '1760950243', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north11', 0),
  ('North Delhi - Rohini.pdf', '6', 'Rohini', 'North', '301', '', '', 'Ms. Aanchal', 'District Judge-03', 'Sh. Joginder', '9667629389', 'adj03-north@ddc.nic.in', '1762913100', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north06', 0),
  ('North Delhi - Rohini.pdf', '7', 'Rohini', 'North', '407', '', '', 'Mr. Akbar Siddique', 'District Judge - 04', 'Sh. Subhash Chander Saini', '9891181699', 'adj04-north@ddc.nic.in', '1762998063', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north16', 0),
  ('North Delhi - Rohini.pdf', '8', 'Rohini', 'North', '306', '', '', 'Sh. Neeraj Sharma', 'Additional Session Judge- 01 (POCSO)', 'Sh. Sunil Dimri', '9868992314', 'asjpocso01-north@ddc.nic.in', '1764483194', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north03', 0),
  ('North Delhi - Rohini.pdf', '9', 'Rohini', 'North', '202', '', '', 'Ms. Vandana', 'Additional Sessions Judge-02', 'Sh. Lalit Singh Negi', '7982227561', 'asj02-north@ddc.nic.in', '1762530845', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north15', 0),
  ('North Delhi - Rohini.pdf', '10', 'Rohini', 'North', '312', '', '', 'Sh. Jagmohan Singh', 'Additional Sessions Judge-03', 'Sh. Dharmender Sehrawat', '9968267664', 'asj03-north@ddc.nic.in', '1768990246', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north13', 0),
  ('North Delhi - Rohini.pdf', '11', 'Rohini', 'North', '206', '', '', 'Ms. Richa Manchanda', 'Additional Sessions Judge-04', 'Sh. Arun Bhardwaj', '8287701426', 'asj04-north@ddc.nic.in', '1761575605', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north09', 0),
  ('North Delhi - Rohini.pdf', '12', 'Rohini', 'North', '302', '', '', 'Ms. Pooja Jain', 'Additional Sessions Judge-05 (POCSO)', 'Sh. Deepak', '9220270427', 'asjpocso05-north@ddc.nic.in', '1765185912', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north08', 0),
  ('North Delhi - Rohini.pdf', '13', 'Rohini', 'North', '12', '', '', 'Sh. Manish Khurana', 'PO MACT -01', 'Sh. Sumer Chand Khatri', '9268883454', 'delhinorth.mact@delhi.gov.in', '1767266360', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north10', 0),
  ('North Delhi - Rohini.pdf', '14', 'Rohini', 'North', '13', '', '', 'Sh. Viplav Dabass', 'PO MACT-02', 'Sh. Rakesh Kumar', '9430843630', 'delhinorth.mact02@delhi.gov.in', '1766551650', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north04', 0),
  ('North Delhi - Rohini.pdf', '15', 'Rohini', 'North', '308', '', '', 'Ms. Manu Goel Kharb', 'Additional Sessions Judge (FTSC) (POCSO)', 'Ms. Anita Kumari Kachhwaya', '9910036373', 'asjftscpocso-nt@ddc.nic.in', '1763468908', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north17', 0),
  ('North Delhi - Rohini.pdf', '16', 'Rohini', 'North', '207', '', '', 'Sh. Sushil Anuj Tyagi', 'Additional Sessions Judge (Spl. Judge NDPS)', 'Sh. Sushil Kumar', '9968200182', 'asjsjndps-north@ddc.nic.in', '1763315805', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north12', 0),
  ('North Delhi - Rohini.pdf', '17', 'Rohini', 'North', '204', '', '', 'Sh. Rajesh Kumar', 'Additional Sessions Judge, Spl. Fast Track Court', 'Sh. Rakesh Kumar', '9541293816', 'asjsjftc-north@ddc.nic.in', '1763265914', 'https://districtcourtrohini.webex.com/meet/ddc.vc.north14', 0),
  ('North Delhi - Rohini.pdf', '18', 'Rohini', 'North', '115', '', '', 'Ms. Priyanka Rajpoot', 'Chief Judicial Magistrate', 'Sh. Naveen Rohilla', '9212402596', 'cmm-north@ddc.nic.in', '1763312235', 'https://districtcourtrohini.webex.com/meet/reader.cmmnorth', 0),
  ('North Delhi - Rohini.pdf', '19', 'Rohini', 'North', '117', '', '', 'Ms. Tapasya Agarwal', 'Additional Chief Judicial Magistrate', 'Sh. Kishan Kumar', '8800226711', 'acmm-north@ddc.nic.in', '1769107220', 'https://districtcourtrohini.webex.com/meet/reader.acmmnorth', 0),
  ('North Delhi - Rohini.pdf', '20', 'Rohini', 'North', '116', '', '', 'Sh. Rishabh Kapoor', 'Judicial Magistrate First Class - 01', 'Sh. Vijay Kumar', '8901507577', 'mm01-north@ddc.nic.in', '1763419210', 'https://districtcourtrohini.webex.com/meet/reader.mm01north', 0),
  ('North Delhi - Rohini.pdf', '21', 'Rohini', 'North', '319', '', '', 'Dr. Neha Kheria', 'Judicial Magistrate First Class - 02', 'Sh. Yogender Kumar Vats', '9818529355', 'mm02-north@ddc.nic.in', '1769268679', 'https://districtcourtrohini.webex.com/meet/reader.mm02north', 0),
  ('North Delhi - Rohini.pdf', '22', 'Rohini', 'North', '213', '', '', 'Sh. Aakash Sharma', 'Judicial Magistrate First Class - 03', 'Sh. Ashwani', '99208076', 'mm03-north@ddc.nic.in', '1769167470', 'https://districtcourtrohini.webex.com/meet/reader.mm03.north', 0),
  ('North Delhi - Rohini.pdf', '23', 'Rohini', 'North', '14', '', '', 'Ms. Richika Tyagi', 'Judicial Magistrate First Class - 04', 'Ms. Neelam Chauhan', '9810924227', 'mm04-north@ddc.nic.in', '1765990904', 'https://districtcourtrohini.webex.com/meet/readermm04north', 0),
  ('North Delhi - Rohini.pdf', '24', 'Rohini', 'North', '114', '', '', 'Ms. Bharti Beniwal', 'Judicial Magistrate First Class - 05', 'Sh. Ranbir Singh', '8130817611', 'mm05-north@ddc.nic.in', '1763475662', 'https://districtcourtrohini.webex.com/meet/reader.mm05north', 0),
  ('North Delhi - Rohini.pdf', '25', 'Rohini', 'North', '320', '', '', 'Ms. Garima Jindal', 'Judicial Magistrate First Class - 06', 'Sh. Mukesh Kumar Varun', '9990462655', 'mm06-north@ddc.nic.in', '1760400022', 'https://districtcourtrohini.webex.com/meet/reader.mm06north', 0),
  ('North Delhi - Rohini.pdf', '26', 'Rohini', 'North', '6', '', '', 'Sh. Sahil Gupta', 'Judicial Magistrate First Class -07', 'Sh. Tejpal', '9716268971', 'mm07-north@ddc.nic.in', '1762415075', 'https://districtcourtrohini.webex.com/meet/reader.mm7north', 0),
  ('North Delhi - Rohini.pdf', '27', 'Rohini', 'North', '103', '', '', 'Ms. Sanya Dalal', 'Judicial Magistrate First Class (Mahila Court) -01', 'Sh. Sunil', '9899257378', 'mahilacourt01-nt@ddc.nic.in', '1767045138', 'https://districtcourtrohini.webex.com/meet/readermmmahilacourtnorthrohini', 1),
  ('North Delhi - Rohini.pdf', '28', 'Rohini', 'North', '104', '', '', 'Ms. Disha Singh', 'Judicial Magistrate First Class (Mahila Court) -02', 'Ms. Saran Kaur', '9990219571', 'mahilacourt02-nt@ddc.nic.in', '1768856817', 'https://districtcourtrohini.webex.com/meet/reader.mm2north', 1),
  ('North Delhi - Rohini.pdf', '29', 'Rohini', 'North', '118', '', '', 'Sh. Sunil Khatri', 'Judicial Magistrate First Class (NI Act)', 'Sh. Praveen', '9910166608', 'mmniactdc-north@ddc.nic.in', '1769049636', 'https://districtcourtrohini.webex.com/meet/ninorth01', 0),
  ('North Delhi - Rohini.pdf', '30', 'Rohini', 'North', 'Digital Traffic Court', '', '', 'Ms. Shreejee Abbot', 'Judicial Magistrate First Class (Digital Traffic Court)', 'Sh. Manoj Kumar Pal', '8860916074', 'jmfcdtc-north@ddc.nic.in', '25100179419', 'https://districtcourtdelhi.webex.com/meet/jmfcdtc-north', 0),
  ('North Delhi - Rohini.pdf', '31', 'Rohini', 'North', '214', '', '', 'Ms. Akriti Mahendru', 'SCJ cum RC', 'Sh. Mukesh Kumar', '8447693811', 'scj-north@ddc.nic.in', '1760054232', 'https://districtcourtrohini.webex.com/meet/readerscjcumrcnorth', 0),
  ('North Delhi - Rohini.pdf', '32', 'Rohini', 'North', '111', '', '', 'Sh. Bharat Aggarwal', 'JSCC cum ASCJ cum GJ', 'Sh. Rajiv Kumar', '8750515420', 'jsccascjgj-north@ddc.nic.in', '1769325629', 'https://districtcourtrohini.webex.com/meet/reader.ascjnorth111', 0),
  ('North Delhi - Rohini.pdf', '33', 'Rohini', 'North', '215', '', '', 'Sh. Vipul Sandwar', 'ACJ cum CCJ cum ARC', 'Ms. Kanchan Kapoor', '9999214374', 'acj-north@ddc.nic.in', '1761058855', 'https://districtcourtrohini.webex.com/meet/reader.acjnorth', 0),
  ('North Delhi - Rohini.pdf', '34', 'Rohini', 'North', '218', '', '', 'Ms. Sakshi Jaiswal', 'Civil Judge', 'Sh. Lok Shankar', '9540365616', 'cj-north@ddc.nic.in', '1762721502', 'https://districtcourtrohini.webex.com/meet/reader.cj.north', 0),
  ('North Delhi - Rohini.pdf', '35', 'Rohini', 'North', '8', '', '', 'Sh. Deepak Garg', 'Principal Judge Family Court', 'Sh Raj Kumar', '9810521123', 'pjfc-north@ddc.nic.in', '1840410874', 'https://districtcourtdelhi.webex.com/meet/pjfc.north.rohini.courtno-8', 0),
  ('North Delhi - Rohini.pdf', '36', 'Rohini', 'North', '3', '', '', 'Sh. Deepak Dabas', 'Judge Family Court', 'Sh. Amit Mann', '9999310622', 'jfc-north@ddc.nic.in', '1843791826', 'https://districtcourtdelhi.webex.com/meet/jfc.north.rohini.courtno-3', 0),
  ('Northwest - rohini.pdf', '1', 'Rohini', 'North West', '401', '', '', 'Sh. Prem Kumar Barthwal', 'Principal District & Sessions Judge, North-West District', 'Sh. Jeet Singh', '9911230168', 'pdsj-northwest@ddc.nic.in', '1768361187', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest01', 0),
  ('Northwest - rohini.pdf', '2', 'Rohini', 'North West', '406', '', '', 'Sh. Devender Kumar Jangala', 'District Judge (Comm.)-01', 'Sh. Deepak', '8744011500', 'djcomm01-nw@ddc.nic.in', '1768070476', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest02', 0),
  ('Northwest - rohini.pdf', '3', 'Rohini', 'North West', '205', '', '', 'Sh. Manish Gupta', 'District Judge (Comm.)-02', 'Sh. Kuldeep Singh', '9891153053', 'djcomm02-nw@ddc.nic.in', '25142438349', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northwest20', 0),
  ('Northwest - rohini.pdf', '4', 'Rohini', 'North West', '211', '', '', 'Sh. Vikram', 'District Judge-01/PO MACT', 'Sh. Rajesh', '9891917144', 'delhinw.mact@delhi.gov.in', '25105354233', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest10', 0);

INSERT INTO tmp_court_roster (source_file, source_row, court, district, court_no, building, floor, judge_name, designation, court_reader_name, court_reader_phone, court_email, vc_meeting_id, virtual_court_link, mahila_court) VALUES
  ('Northwest - rohini.pdf', '5', 'Rohini', 'North West', '317', '', '', 'Ms. Kiran Gupta', 'District Judge-02', 'Ms. Saroj Yadav', '9650491476', 'adj02-northwest@ddc.nic.in', '1769710442', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest11', 0),
  ('Northwest - rohini.pdf', '6', 'Rohini', 'North West', '311', '', '', 'Sh. Ashish Aggarwal', 'District Judge-03', 'Ms. Alka Rani Dhamija', '8588818015', 'adj03-northwest@ddc.nic.in', '1764047648', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest12', 0),
  ('Northwest - rohini.pdf', '7', 'Rohini', 'North West', '212', '', '', 'Sh. Anuj Kumar Singh', 'District Judge- 04', 'Sh. Ashok Kumar', '7988761546', 'adj04-northwest@ddc.nic.in', '1763205954', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest13', 0),
  ('Northwest - rohini.pdf', '8', 'Rohini', 'North West', '19', '', '', 'Ms. Deepika Singh', 'PO MACT & PO Zonal Vending Committee (MCD)', 'Sh. Ajay Kumar', '8851855196', 'delhinw.mact02@delhi.gov.in', '1762414301', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest14', 0),
  ('Northwest - rohini.pdf', '9', 'Rohini', 'North West', '201', '', '', 'Sh. Kapil Kumar', 'Additional Sessions Judge (Spl. FTC)', 'Ms. Sudesh Verma', '9971967885', 'asjsjftc-nw@ddc.nic.in', '1768556105', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest03', 0),
  ('Northwest - rohini.pdf', '10', 'Rohini', 'North West', '318', '', '', 'Ms. Neeti Suri Mishra', 'Additional Sessions Judge (FTSC) (POCSO)', 'Sh. Narinder Vats', '7840011015', 'asjftscpocso-nw@ddc.nic.in', '1767124637', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest17', 0),
  ('Northwest - rohini.pdf', '11', 'Rohini', 'North West', '316', '', '', 'Sh. Kuljeevan Sidharth', 'Additional Sessions Judge (Electricity)', 'Sh. Manesh Rana', '9818831689', 'asjelectric-nw@ddc.nic.in', '1768605915', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest04', 0),
  ('Northwest - rohini.pdf', '12', 'Rohini', 'North West', '210', '', '', 'Ms. Rajani Ranga', 'Additional Sessions Judge-01 (POCSO)', 'Sh. Gopal Chand', '9818013171', 'asjpocso01-nw@ddc.nic.in', '1765048482', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest05', 0),
  ('Northwest - rohini.pdf', '13', 'Rohini', 'North West', '409', '', '', 'Sh. Sanjay Sharma-II', 'Additional Sessions Judge (Spl. Judge NDPS)', 'Sh. Prem Chand Lodwal', '9873992522', 'asj02-northwest@ddc.nic.in', '1762111139', 'https://districtcourtrohini.webex.com/join/ddc.vc.northwest06', 0),
  ('Northwest - rohini.pdf', '14', 'Rohini', 'North West', '304', '', '', 'Sh. Muneesh Garg', 'Additional Sessions Judge-02', 'Ms. Geeta Gusain', '9891097833', 'asj03-northwest@ddc.nic.in', '1760892617', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest07', 0),
  ('Northwest - rohini.pdf', '15', 'Rohini', 'North West', '203', '', '', 'Ms. Jasjeet Kaur', 'Additional Sessions Judge -04', 'Ms. Seema Mehta', '9999443925', 'asjpocso04-nw@ddc.nic.in', '1766354470', 'https://districtcourtrohini.webex.com/join/ddc.vc.northwest08', 0),
  ('Northwest - rohini.pdf', '16', 'Rohini', 'North West', '217', '', '', 'Sh. Sachin Mittal', 'Additional Sessions Judge-03', 'Sh. Suresh Pajiyar', '9013445912', 'asj05-northwest@ddc.nic.in', '1766239554', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest16', 0),
  ('Northwest - rohini.pdf', '17', 'Rohini', 'North West', '410', '', '', 'Sh. Mayank Mittal', 'Senior Civil Judge cum RC', 'Sh. Raj Kumar', '8373948316', 'scjrc-northwest@ddc.nic.in', '1764033242', 'https://districtcourtrohini.webex.com/meet/ddc.vc.northwest15', 0),
  ('Northwest - rohini.pdf', '18', 'Rohini', 'North West', '309', '', '', 'Sh. Mansi Malik', 'JSCC/ASCJ/GJ', 'Sh. Surender Kumar', '8800719782', 'jsccascjgj-nw@ddc.nic.in', '1768323975', 'https://districtcourtrohini.webex.com/meet/readerjsccascjgjnorthwest', 0),
  ('Northwest - rohini.pdf', '19', 'Rohini', 'North West', '216', '', '', 'Ms. Gita', 'ACJ cum CCJ cum ARC', 'Ms. Sangita Chopra', '9911112860', 'acj-northwest@ddc.nic.in', '1764688940', 'https://districtcourtrohini.webex.com/meet/reader.acj.nw', 0),
  ('Northwest - rohini.pdf', '20', 'Rohini', 'North West', '310-A', '', '', 'Sh. Vaibhav Kumar', 'Civil Judge', 'Sh. Gaurav Bhutani', '9811322254', 'cj-northwest@ddc.nic.in', '1768508990', 'https://districtcourtrohini.webex.com/meet/reader.civiljudgenorthwest', 0),
  ('Northwest - rohini.pdf', '21', 'Rohini', 'North West', '108', '', '', 'Ms. Upasana Satija', 'Chief Judicial Magistrate', 'Sh. Manish Kumar', '9810959171', 'cmm-northwest@ddc.nic.in', '1761386845', 'https://districtcourtrohini.webex.com/meet/readercmmnorthwest', 0),
  ('Northwest - rohini.pdf', '22', 'Rohini', 'North West', '101', '', '', 'Ms. Anuradha Prasad', 'Additional Chief Judicial Magistrate', 'Sh. Manoj Kumar', '9891865998', 'acmm-northwest@ddc.nic.in', '1761821641', 'https://districtcourtrohini.webex.com/meet/reader.acmmnorthwest', 0),
  ('Northwest - rohini.pdf', '23', 'Rohini', 'North West', '102', '', '', 'Sh. Abhinav Singh', 'Judicial Magistrate First Class-01', 'Sh. Sunil Kumar', '9812564160', 'mm01-northwest@ddc.nic.in', '1762278156', 'https://districtcourtrohini.webex.com/meet/readermm01northwestrohini', 0),
  ('Northwest - rohini.pdf', '24', 'Rohini', 'North West', '113', '', '', 'Sh. Apoorv Bhardwaj', 'Judicial Magistrate First Class-02', 'Ms. Jyoti Chhabra', '8510011661', 'mm02-northwest@ddc.nic.in', '1767828253', 'https://districtcourtrohini.webex.com/meet/reader.mm02northwest', 0),
  ('Northwest - rohini.pdf', '25', 'Rohini', 'North West', '107', '', '', 'Ms. Aakanksha', 'Judicial Magistrate First Class-03', 'Sh. Randhir Singh', '8860359390', 'mm03-northwest@ddc.nic.in', '1764617459', 'https://districtcourtrohini.webex.com/meet/reader.mm03.northwest', 0),
  ('Northwest - rohini.pdf', '26', 'Rohini', 'North West', '112', '', '', 'Sh. Sanyam Jain', 'Judicial Magistrate First Class-04', 'Sh. Ajay Kumar', '9868500920', 'mm04-northwest@ddc.nic.in', '1767906569', 'https://districtcourtrohini.webex.com/meet/reader.mm04northwest', 0),
  ('Northwest - rohini.pdf', '27', 'Rohini', 'North West', '105', '', '', 'Ms. Reetika Jain', 'Judicial Magistrate First Class-05', 'Sh. Sanjay Nagar', '9013166096', 'mm05-northwest@ddc.nic.in', '1769711026', 'https://districtcourtrohini.webex.com/meet/reader.mm05northwest', 0),
  ('Northwest - rohini.pdf', '28', 'Rohini', 'North West', '109', '', '', 'Ms. Divyashree Raina', 'Judicial Magistrate First Class-06', 'Sh. Rajesh Kumar', '9717812488', 'mm06-northwest@ddc.nic.in', '1761691749', 'https://districtcourtrohini.webex.com/meet/reader.mm06northwest', 0),
  ('Northwest - rohini.pdf', '29', 'Rohini', 'North West', '208', '', '', 'Sh. Jitender', 'Judicial Magistrate First Class-07', 'Sh. Surender', '9811604603', 'mm07-northwest@ddc.nic.in', '1766879230', 'https://districtcourtrohini.webex.com/meet/reader.mm07northwest', 0),
  ('Northwest - rohini.pdf', '30', 'Rohini', 'North West', '106', '', '', 'Ms. Divya Singh', 'Judicial Magistrate First Class (Mahila Court)-01', 'Sh. Anil', '9654080753', 'mahilacourt01-nw@ddc.nic.in', '1762373602', 'https://districtcourtrohini.webex.com/meet/reader.mmmahilacourt106nw', 1),
  ('Northwest - rohini.pdf', '31', 'Rohini', 'North West', '18', '', '', 'Ms. Neha Goel', 'Judicial Magistrate First Class (Mahila Court)-02', 'Ms. Pooja Sharma', '9891303593', 'mahilacourt02-nw@ddc.nic.in', '1766295938', 'https://districtcourtrohini.webex.com/meet/reader.mmmahilacourtno2nw', 1),
  ('Northwest - rohini.pdf', '32', 'Rohini', 'North West', '110', '', '', 'Ms. Nitika', 'Judicial Magistrate First Class (NI Act)', 'Sh. Dheeraj Varma', '9716506992', 'mmniact-nw@ddc.nic.in', '1760095352', 'https://districtcourtrohini.webex.com/meet/reader.mmniactnorthwest', 0),
  ('Northwest - rohini.pdf', '33', 'Rohini', 'North West', 'Digital Traffic Court', '', '', 'Sh. Yashu Khurana', 'Judicial Magistrate First Class (Digital Traffic Court)', 'Sh. Sunder Singh', '9810336619', 'jmfcdtc-nw@ddc.nic.in', '25140220058', 'https://districtcourtdelhi.webex.com/meet/jmfcdtc-nw', 0),
  ('Northwest - rohini.pdf', '34', 'Rohini', 'North West', '4', '', '', 'Sh. Mukesh Kumar Gupta', 'Principal Judge Family Court', 'Sh. Jitendra Mann', '9582302330', 'pjfc-northwest@ddc.nic.in', '1845556482', 'https://districtcourtdelhi.webex.com/meet/pjfc.northwest.rohini.courtno-4', 0),
  ('Northwest - rohini.pdf', '35', 'Rohini', 'North West', '7', '', '', 'Sh. Hem Raj', 'Judge Family Court', 'Sh. Pardeep', '9818454858', 'jfc-northwest@ddc.nic.in', '1849989721', 'https://districtcourtdelhi.webex.com/meet/jfc.north-west.rohini.courtno-7', 0),
  ('North East - karkardooma.pdf', '1', 'Karkardooma', 'North East', '2', '', '', 'Sh. Sanjay Garg-II', 'Principal District & Sessions Judge', 'Raj Kumar', '9958423423', 'pdsj-northeast@ddc.nic.in', '1763915514', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northeast01', 0),
  ('North East - karkardooma.pdf', '2', 'Karkardooma', 'North East', '201-NCB', '', '', 'Sh. Gorakh Nath Pandey', 'DJ-Commercial Court', 'Narender Sharma', '9717312236', 'djcomm-northeast@ddc.nic.in', '1763296417', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northeast02', 0),
  ('North East - karkardooma.pdf', '3', 'Karkardooma', 'North East', '202-NCB', '', '', 'Sh. Ashish Gupta', 'DJ-01', 'Rekha Sharma', '9873336070', 'adj01-northeast@ddc.nic.in', '25227917056', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northeast03', 0),
  ('North East - karkardooma.pdf', '4', 'Karkardooma', 'North East', '75', '', '', 'Ms. Ritu Singh', 'ASJ (POCSO-01)', 'Asha Bisht', '9971767519', 'asjpocso01-ne@ddc.nic.in', '1768402831', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northeast04', 0),
  ('North East - karkardooma.pdf', '5', 'Karkardooma', 'North East', '63', '', '', 'Sh. Nipun Awasthi', 'SPL. JUDGE (NDPS)', 'Deeraj Singh Chauhan', '9868590844', 'asjspljudgendps-ne@ddc.nic.in', '1767276641', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northeast05', 0),
  ('North East - karkardooma.pdf', '6', 'Karkardooma', 'North East', '65', '', '', 'Ms. Twinkle Wadhwa', 'ASJ-02 (SC-ST ACT)', 'Neerja Verma', '9205022156', 'asj02scstact-ne@ddc.nic.in', '1766017009', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northeast06', 0),
  ('North East - karkardooma.pdf', '7', 'Karkardooma', 'North East', '56', '', '', 'Sh. Praveen Singh', 'ASJ-03', 'Naresh Bhandari', '9910525636', 'asj03-northeast@ddc.nic.in', '1767078771', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northeast07', 0),
  ('North East - karkardooma.pdf', '8', 'Karkardooma', 'North East', 'G-03-NCB', '', '', 'Sh. Manish Sharma', 'PO-MACT', 'Ranjana Anil Mahor', '9868241325', 'delhinortheast.mact@delhi.gov.in', '1765675755', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northeast08', 0),
  ('North East - karkardooma.pdf', '9', 'Karkardooma', 'North East', '68', '', '', 'Ms. Tanya Bamniyal', 'CJM', 'Sanjay Singh', '9210873999', 'cmm-northeast@ddc.nic.in', '1768709320', 'https://districtcourtdelhi.webex.com/meet/readercmmnortheast', 0);

INSERT INTO tmp_court_roster (source_file, source_row, court, district, court_no, building, floor, judge_name, designation, court_reader_name, court_reader_phone, court_email, vc_meeting_id, virtual_court_link, mahila_court) VALUES
  ('North East - karkardooma.pdf', '10', 'Karkardooma', 'North East', '66', '', '', 'Sh. Tushar Gupta', 'ACJM', 'Rajesh Rajput', '9971769222', 'acmm-northeast@ddc.nic.in', '1764657201', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northeast14', 0),
  ('North East - karkardooma.pdf', '11', 'Karkardooma', 'North East', '52', '', '', 'Sh. Anmol Nohria', 'JMFC-02', 'Kamal Kishore', '9811455561', 'mm02-northeast@ddc.nic.in', '1766513644', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northeast12', 0),
  ('North East - karkardooma.pdf', '12', 'Karkardooma', 'North East', '22', '', '', 'Ms. Norma Jain', 'JMFC-03', 'Anshu Meena', '9250670453', 'mm03-northeast@ddc.nic.in', '1767102226', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northeast13', 0),
  ('North East - karkardooma.pdf', '13', 'Karkardooma', 'North East', '67', '', '', 'Ms. Rishika Srivastava', 'JMFC (MAHILA COURT-01)', 'Meenakshi Bhutani', '8130708163', 'mahilacourt01-ne@ddc.nic.in', '1768254562', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.northeast15', 1),
  ('North East - karkardooma.pdf', '14', 'Karkardooma', 'North East', '5', '', '', 'Ms. Kirandeep Kaur', 'JMFC-01', 'Girish Vaidya', '8130574528', 'mm01-northeast@ddc.nic.in', '1762646509', 'https://districtcourtdelhi.webex.com/meet/readermm1northeast', 0),
  ('North East - karkardooma.pdf', '15', 'Karkardooma', 'North East', '204-NCB', '', '', 'Ms. Tania Singh', 'SCJ-CUM-RC', 'Kamal Singh', '7982190681', 'scjrc-northeast@ddc.nic.in', '1767734995', 'https://districtcourtdelhi.webex.com/meet/readerscjnortheast', 0),
  ('North East - karkardooma.pdf', '16', 'Karkardooma', 'North East', '203-NCB', '', '', 'Sh. Ajay Kumar Malik', 'JSCC/ASCJ/GJ', 'Rajeev Verma', '8745000518', 'jsccascj-ne@ddc.nic.in', '1764286462', 'https://districtcourtdelhi.webex.com/meet/readerascjnortheast', 0),
  ('North East - karkardooma.pdf', '17', 'Karkardooma', 'North East', '316', '', '', 'Sh. Pranat Kumar Joshi', 'ACJ/CCJ/ARC', 'Kusum Lata Verma', '9868819831', 'acjccjarc-ne@ddc.nic.in', '1765806761', 'https://districtcourtdelhi.webex.com/meet/readeracjnortheast', 0),
  ('North East - karkardooma.pdf', '18', 'Karkardooma', 'North East', '9', '', '', 'Ms. Neha Garg', 'JMFC (MAHILA COURT-02)', 'Shaveta Manocha', '7290970757', 'mahilacourt02-ne@ddc.nic.in', '25113455648', 'https://districtcourtdelhi.webex.com/meet/mahilacourt02-ne', 1),
  ('North East - karkardooma.pdf', '19', 'Karkardooma', 'North East', '64', '', '', 'Ms. Isra Zaidi', 'JMFC-04', 'Anil Kumar', '9810525728', 'mm04-northeast@ddc.nic.in', '25175829957', 'https://districtcourtdelhi.webex.com/meet/mm04-northeast', 0),
  ('North East - karkardooma.pdf', '20', 'Karkardooma', 'North East', '72', '', '', 'Sh. Sachin Sood', 'ASJ (SC-POCSO)-01', 'Sarita Negi', '7042144200', 'asjscpocso01-ne@ddc.nic.in', '25175409002', 'https://districtcourtdelhi.webex.com/meet/asjscpocso01-ne', 0),
  ('North East - karkardooma.pdf', '21', 'Karkardooma', 'North East', '205-NCB', '', '', 'Ms. Colette Rashmi Kujur', 'DJ-02', 'Balwant Singh Negi', '7678650702', 'adj02-northeast@ddc.nic.in', '25110995481', 'https://districtcourtdelhi.webex.com/meet/adj02-northeast', 0),
  ('North East - karkardooma.pdf', '22', 'Karkardooma', 'North East', '312', '', '', 'Sh. Babru Bhan', 'ASJ-04', 'Raman Chaudhary', '9911329333', 'asj04-northeast@ddc.nic.in', '25134699701', 'https://districtcourtdelhi.webex.com/meet/asj04-northeast', 0),
  ('North East - karkardooma.pdf', '23', 'Karkardooma', 'North East', '404-NCB', '', '', 'Ms. Pranjali Prakash', 'JMFC (DIGITAL TRAFFIC COURT)', 'Nand Kr. Chaurasia', '9968293026', 'dtc-northeast@ddc.nic.in', '25183144644', 'https://districtcourtdelhi.webex.com/meet/dtc-northeast', 0),
  ('North East - karkardooma.pdf', '24', 'Karkardooma', 'North East', 'FC-2', '', '', 'Ms. Hemani Malhotra', 'Principal Judge', 'Pooja Gupta', '9711115825', 'pjfc-northeast@ddc.nic.in', '1843084483', 'https://districtcourtdelhi.webex.com/meet/pjfc.northeast.kkd.courtno-2', 0),
  ('North East - karkardooma.pdf', '25', 'Karkardooma', 'North East', 'FC-3', '', '', 'Ms. Harleen Singh', 'Judge-Family Court', 'Ghanshyam', '9818442204', 'jfc-northeast@ddc.nic.in', '1848753892', 'https://districtcourtdelhi.webex.com/meet/jfc.north-east.kkd.courtno-3', 0),
  ('North East - karkardooma.pdf', '26', 'Karkardooma', 'North East', 'FC-48', '', '', 'Sh. Naresh Kumar Laka', 'Judge-Family Court-02', 'Vijay Kumar', '9911407037', 'jfc02-northeast@ddc.nic.in', '25186051164', 'https://districtcourtdelhi.webex.com/meet/jfc02-northeast', 0),
  ('North East - karkardooma.pdf', '27', 'Karkardooma', 'North East', '18', '', '', 'Sh. Hem Singh', 'Additional Sessions Judge (SC- POCSO)-02', 'Ajay Kumar', '9811134909', 'asjscpocso02-ne@ddc.nic.in', '25101926652', 'https://districtcourtdelhi.webex.com/meet/asjscpocso02-ne', 0),
  ('North East - karkardooma.pdf', '28', 'Karkardooma', 'North East', '31', '', '', 'Sh. Balwinder Singh', 'ASJ (FTC)', 'Ravi Shankar Kumar', '9868356124', 'asjftc-northeast@ddc.nic.in', '25117208520', 'https://districtcourtdelhi.webex.com/meet/asjftc-northeast', 0),
  ('North East - karkardooma.pdf', '29', 'Karkardooma', 'North East', '409-NCB', '', '', 'Ms. Sanjana Kasana', 'JMFC (NI ACT)', 'Kamal Kishore', '9810395739', 'mmniactdc-ne@ddc.nic.in', '1764273010', 'https://districtcourtdelhi.webex.com/meet/ninortheast1', 0),
  ('Shahdara.pdf', '1', 'Karkardooma', 'Shahdara', '47', '', '', 'Sh. Pawan Kumar Matto', 'Principal District & Sessions Judge', 'Vijay Kr. Sharma', '9540474242', 'pdsj-shd@ddc.nic.in', '1763915514', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara01', 0),
  ('Shahdara.pdf', '2', 'Karkardooma', 'Shahdara', '301-NCB', '', '', 'Sh. Pritam Singh', 'DJ(Commercial Court)-01', 'Sunita Bhatnagar', '9818090455', 'djcomm01-shd@ddc.nic.in', '1760383813', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara02', 0),
  ('Shahdara.pdf', '3', 'Karkardooma', 'Shahdara', '208-NCB', '', '', 'Sh. Vipin Kumar Rai', 'DJ(Commercial Court)-02', 'Harvinder Kaur', '9968032662', 'djcomm02-shd@ddc.nic.in', '1765194349', 'https://districtcourtdelhi.webex.com/meet/readerdjcomm02shahdara', 0),
  ('Shahdara.pdf', '4', 'Karkardooma', 'Shahdara', '303-NCB', '', '', 'Sh. Ramesh Kumar-II', 'DJ(Commercial Court)-03', 'Mukesh Kumar', '7302678350', 'djcomm03-shd@ddc.nic.in', '25186232657', 'https://districtcourtdelhi.webex.com/meet/djcomm03-shd', 0),
  ('Shahdara.pdf', '5', 'Karkardooma', 'Shahdara', '304-NCB', '', '', 'Vacant', 'DJ(Commercial Court)-04', 'Sujit Kumar', '9891190651', 'djcomm04-shd@ddc.nic.in', '25118434536', 'https://districtcourtdelhi.webex.com/meet/djcomm04-shd', 0),
  ('Shahdara.pdf', '6', 'Karkardooma', 'Shahdara', '51', '', '', 'Sh. Munish Bansal', 'ASJ-04', 'Asha Rani', '9968299598', 'asj04-shd@ddc.nic.in', '1766341025', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara03', 0),
  ('Shahdara.pdf', '7', 'Karkardooma', 'Shahdara', '317', '', '', 'Ms. Charu Aggarwal', 'ASJ-02/(SC-ST Act)', 'Bhupender Kumar', '9971167202', 'asj02ecourt-shd@ddc.nic.in', '1762505296', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara04', 0),
  ('Shahdara.pdf', '8', 'Karkardooma', 'Shahdara', '58', '', '', 'Sh. Sameer Bajpai', 'ASJ-03', 'Annu', '8800487289', 'asj03-shd@ddc.nic.in', '1764930056', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara05', 0),
  ('Shahdara.pdf', '9', 'Karkardooma', 'Shahdara', '305-NCB', '', '', 'Sh. Joginder Prakash Nahar', 'DJ-02', 'Virendra Kumar', '9958845307', 'adj02-shd@ddc.nic.in', '1763494039', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara06', 0),
  ('Shahdara.pdf', '10', 'Karkardooma', 'Shahdara', '80', '', '', 'Ms. Aakanksha Vyas', 'ASJ-06 (POCSO)', 'Sanjay Kalra', '9212709383', 'asjpocso06-shd@ddc.nic.in', '1762738665', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara07', 0),
  ('Shahdara.pdf', '11', 'Karkardooma', 'Shahdara', '302-NCB', '', '', 'Sh. Gaurav', 'DJ-01', 'Meenu Gupta', '9891188880', 'adj01-shd@ddc.nic.in', '1761973971', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara08', 0),
  ('Shahdara.pdf', '12', 'Karkardooma', 'Shahdara', 'G-02-NCB', '', '', 'Sh. Vijay Kumar Jha', 'PO-MACT-01', 'Shailendra Rawat', '9953716503', 'delhishahdara.mact@delhi.gov.in', '1768073922', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara09', 0),
  ('Shahdara.pdf', '13', 'Karkardooma', 'Shahdara', '28', '', '', 'Dr. Sumedh Kumar Sethi', 'ASJ-05', 'Yogita Rani', '8800093551', 'asj05-shd@ddc.nic.in', '1765973824', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara11', 0),
  ('Shahdara.pdf', '14', 'Karkardooma', 'Shahdara', '79', '', '', 'Sh. Himanshu Raman Singh', 'ASJ-01 (POCSO)', 'Jeet Kumar Sohra', '7289820688', 'asjpocso01-shd@ddc.nic.in', '1765749028', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara12', 0),
  ('Shahdara.pdf', '15', 'Karkardooma', 'Shahdara', '59', '', '', 'Sh. Mohit Sharma', 'CJM', 'Preshant Rastogi', '9810192387', 'cmm-shd@ddc.nic.in', '25131864960', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara13', 0),
  ('Shahdara.pdf', '16', 'Karkardooma', 'Shahdara', '307-NCB', '', '', 'Ms. Pragati', 'SCJ/RC', 'Neetu Verma', '9911113066', 'scjrc-shd@ddc.nic.in', '1763706912', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara14', 0),
  ('Shahdara.pdf', '17', 'Karkardooma', 'Shahdara', '62', '', '', 'Sh. Manish Jain', 'ACJM', 'Rajesh Chopra', '9818243670', 'acmm-shd@ddc.nic.in', '1764295309', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.shahdara15', 0),
  ('Shahdara.pdf', '18', 'Karkardooma', 'Shahdara', '308-NCB', '', '', 'Sh. Gaurav Sharma', 'ASCJ/JSCC/GJ', 'Lalit Kumar Ray', '7982132342', 'ascjjsccgj-shd@ddc.nic.in', '1762120507', 'https://districtcourtdelhi.webex.com/meet/readerascjshahdara', 0),
  ('Shahdara.pdf', '19', 'Karkardooma', 'Shahdara', '53', '', '', 'Ms. Charu Asiwal', 'ACJ/ARC/CCJ', 'Sangeeta Rana', '9811686948', 'acjarcccj-shd@ddc.nic.in', '1767361501', 'https://districtcourtdelhi.webex.com/meet/readeracjshahdara', 0),
  ('Shahdara.pdf', '20', 'Karkardooma', 'Shahdara', '19', '', '', 'Sh. Rangat Ghirra', 'JMFC-03', 'Manoj Kumar Singh', '8800331317', 'mm03-shd@ddc.nic.in', '1765222817', 'https://districtcourtdelhi.webex.com/meet/readermm03shahdara', 0);

INSERT INTO tmp_court_roster (source_file, source_row, court, district, court_no, building, floor, judge_name, designation, court_reader_name, court_reader_phone, court_email, vc_meeting_id, virtual_court_link, mahila_court) VALUES
  ('Shahdara.pdf', '21', 'Karkardooma', 'Shahdara', '54', '', '', 'Ms. Sukriti Jha', 'JMFC-01', 'Rajeev Kumar', '9560325250', 'mm01-shd@ddc.nic.in', '1768893210', 'https://districtcourtdelhi.webex.com/meet/readermm01shahdara', 0),
  ('Shahdara.pdf', '22', 'Karkardooma', 'Shahdara', '60', '', '', 'Ms. Kanika Aggarwal', 'JMFC (Mahila Court-02)', 'Ritu Harish Kumar', '9990664572', 'mahilacourt2-shd@ddc.nic.in', '1763028695', 'https://districtcourtdelhi.webex.com/meet/readermc02shahdara', 1),
  ('Shahdara.pdf', '23', 'Karkardooma', 'Shahdara', '55', '', '', 'Ms. Shipra Dhankar', 'JMFC (Mahila Court-01)', 'Yogendra Kumar', '9718898017', 'mahilacourt1-shd@ddc.nic.in', '1769989571', 'https://districtcourtdelhi.webex.com/meet/readermc01shahdara', 1),
  ('Shahdara.pdf', '24', 'Karkardooma', 'Shahdara', '38', '', '', 'Sh. Abhinav Ahlawat', 'JMFC-02', 'Radha Rawat', '9560011715', 'mm02-shd@ddc.nic.in', '1762770333', 'https://districtcourtdelhi.webex.com/meet/readermm02shahdara', 0),
  ('Shahdara.pdf', '25', 'Karkardooma', 'Shahdara', '7', '', '', 'Ms. Anushtha Srivastava', 'JMFC-05', 'Vikram Dutt Vashisht', '8744018778', 'mm05-shd@ddc.nic.in', '1766731896', 'https://districtcourtdelhi.webex.com/meet/readermm05shahdara', 0),
  ('Shahdara.pdf', '26', 'Karkardooma', 'Shahdara', '25', '', '', 'Ms. Arushi Parwal', 'JMFC-06', 'Veer Singh', '9811017066', 'mm06-shd@ddc.nic.in', '1761087219', 'https://districtcourtdelhi.webex.com/meet/readermm06shahdara', 0),
  ('Shahdara.pdf', '27', 'Karkardooma', 'Shahdara', '309-NCB', '', '', 'Sh. Gaurav Katariya', 'CIVIL JUDGE-01', 'Harinder Sharma', '9868928495', 'cj01-shd@ddc.nic.in', '1762143864', 'https://districtcourtdelhi.webex.com/meet/readercjshd', 0),
  ('Shahdara.pdf', '28', 'Karkardooma', 'Shahdara', '13', '', '', 'Sh. Ashish Kumar Meena', 'JMFC-04', 'Rajni A. Kumar', '9899215210', 'mm04-shd@ddc.nic.in', '1766146968', 'https://districtcourtdelhi.webex.com/meet/readermm04shahdara', 0),
  ('Shahdara.pdf', '29', 'Karkardooma', 'Shahdara', '8', '', '', 'Ms. Pooja Suhag', 'JMFC (Mahila Court-03)', 'Ashwani Malhotra', '9818534255', 'mahilacourt3-shd@ddc.nic.in', '1768268525', 'https://districtcourtdelhi.webex.com/meet/readermc03shahdara', 1),
  ('Shahdara.pdf', '30', 'Karkardooma', 'Shahdara', '4', '', '', 'Ms. Isha Singh', 'JMFC-07', 'Komal Lata Negi', '9968311541', 'mm07-shd@ddc.nic.in', '25145663731', 'https://districtcourtdelhi.webex.com/meet/mm07-shd', 0),
  ('Shahdara.pdf', '31', 'Karkardooma', 'Shahdara', '401-NCB', '', '', 'Sh. Varun Chandra', 'CIVIL JUDGE-02', 'Rajni Jakhmola', '9818600546', 'cj02-shd@ddc.nic.in', '25131854416', 'https://districtcourtdelhi.webex.com/meet/cj02-shd', 0),
  ('Shahdara.pdf', '32', 'Karkardooma', 'Shahdara', '71', '', '', 'Ms. Preeti Agarwala', 'ASJ(SC-POCSO)-01', 'Shyam Singh', '9810311211', 'asjscpocso01-shd@ddc.nic.in', '25142209663', 'https://districtcourtdelhi.webex.com/meet/asjscpocso01-shd', 0),
  ('Shahdara.pdf', '33', 'Karkardooma', 'Shahdara', '402-NCB', '', '', 'Ms. Padma Ladol', 'CJ-03', 'Raj Kumar Singh', '9899297471', 'cj03-shd@ddc.nic.in', '25124589905', 'https://districtcourtdelhi.webex.com/meet/cj03-shd', 0),
  ('Shahdara.pdf', '34', 'Karkardooma', 'Shahdara', 'G-08-NCB', '', '', 'Sh. Vipin Kharb', 'DJ-03', 'Hari Kant Kukreti', '8383846124', 'adj03-shd@ddc.nic.in', '25168848160', 'https://districtcourtdelhi.webex.com/meet/adj03-shd', 0),
  ('Shahdara.pdf', '35', 'Karkardooma', 'Shahdara', '61', '', '', 'Sh. Harvinder Singh Johal', 'ASJ-07', 'Bhagwat Singh', '8920109475', 'asj07-shd@ddc.nic.in', '25176540389', 'https://districtcourtdelhi.webex.com/meet/asj07-shd', 0),
  ('Shahdara.pdf', '36', 'Karkardooma', 'Shahdara', 'FC-4', '', '', 'Ms. Nirja Bhatia', 'Principal Judge', 'Sanjay Kumar', '9540011787', 'pjfc-shd@ddc.nic.in', '1845899125', 'https://districtcourtdelhi.webex.com/meet/pjfc.shahdara.kkd.courtno.4', 0),
  ('Shahdara.pdf', '37', 'Karkardooma', 'Shahdara', 'FC-50', '', '', 'Sh. Vishal Singh', 'Judge-Family Court-02', 'Chander Shekhar', '9911376013', 'jfc02-shd@ddc.nic.in', '1849258734', 'https://districtcourtdelhi.webex.com/meet/jfc.shahdara.kkd.courtno-50', 0),
  ('Shahdara.pdf', '38', 'Karkardooma', 'Shahdara', 'FC-46', '', '', 'Ms. Chetna Singh', 'Judge-Family Court-01', 'Naresh Kumar Pal', '9873544563', 'jfc01-shd@ddc.nic.in', '25114618407', 'https://districtcourtdelhi.webex.com/meet/jfc01-shd', 0),
  ('Shahdara.pdf', '39', 'Karkardooma', 'Shahdara', 'FC-49', '', '', 'Sh. Sharad Gupta', 'Judge-Family Court-03', 'Gulshan', '9871490064', 'jfc03-shd@ddc.nic.in', '25120205127', 'https://districtcourtdelhi.webex.com/meet/jfc03-shd', 0),
  ('Shahdara.pdf', '40', 'Karkardooma', 'Shahdara', 'G-04-NCB', '', '', 'Sh. Virender Singh', 'PO (MACT)-02', 'Naveen Jindal', '9810555892', 'pomact02-shd@ddc.nic.in', '25122143816', 'https://districtcourtdelhi.webex.com/meet/pomact02-shd', 0),
  ('Shahdara.pdf', '41', 'Karkardooma', 'Shahdara', '17', '', '', 'Sh. Ankur Jain-II', 'Additional Session Judge (SC- POCSO)-02', 'Nirmala Pandey', '9990890552', 'asjscpocso02-shd@ddc.nic.in', '25133908037', 'https://districtcourtdelhi.webex.com/meet/asjscpocso2-shd', 0),
  ('Shahdara.pdf', '42', 'Karkardooma', 'Shahdara', '11', '', '', 'Sh. Vineet Kumar', 'Special Judge (NDPS)', 'Rajesh Khanna', '9818535954', 'spljudgendps-shd@ddc.nic.in', '25125763298', 'https://districtcourtdelhi.webex.com/meet/spljudgendps-shd', 0),
  ('Shahdara.pdf', '43', 'Karkardooma', 'Shahdara', '306-NCB', '', '', 'Sh. Mukesh Kumar', 'District Judge-04', 'Surinder Kumar', '9540054990', 'adj04-shd@ddc.nic.in', '25182722794', 'https://districtcourtdelhi.webex.com/meet/adj04-shd', 0),
  ('Shahdara.pdf', '44', 'Karkardooma', 'Shahdara', '405-NCB', '', '', 'Sh. Komal', 'JMFC (Digital Traffic Court)', 'Avon Kumar Beniwal', '9818272565', 'dtc-shahdara@ddc.nic.in', '25191744612', 'https://districtcourtdelhi.webex.com/meet/dtc-shahdara', 0),
  ('Shahdara.pdf', '45', 'Karkardooma', 'Shahdara', '57', '', '', 'Sh. Harvinder Singh', 'ASJ (FTC)', 'Geeta Mehra', '9899992537', 'asjftc-shd@ddc.nic.in', '25177346319', 'https://districtcourtdelhi.webex.com/meet/asjftc-shd', 0),
  ('Shahdara.pdf', '46', 'Karkardooma', 'Shahdara', 'G-05-NCB', '', '', 'Ms. Manisha Bhau', 'JMFC (NI Act)', 'Pradip Hansda', '9811661642', 'jmfcniact-shd@ddc.nic.in', '25126189080', 'https://districtcourtdelhi.webex.com/meet/jmfcniact-shd', 0),
  ('Shahdara.pdf', '47', 'Karkardooma', 'Shahdara', 'G-06-NCB', '', '', 'Sh. Rahul Saini', 'JMFC-08', 'Jai Narayan Sharma', '7838208496', 'jmfc08-shd@ddc.nic.in', '25175391972', 'https://districtcourtdelhi.webex.com/meet/jmfc08-shd', 0),
  ('Shahdara.pdf', '48', 'Karkardooma', 'Shahdara', '20', '', '', 'Sh. Abhay Choudhary', 'JMFC-09', 'Kamal Kishor', '9958464333', 'jmfc09-shd@ddc.nic.in', '25176645195', 'https://districtcourtdelhi.webex.com/meet/jmfc09-shd', 0),
  ('South East - Saket.pdf', '1', 'Saket', 'South East', '500', 'Main building', '', 'Ms. Hemani Malhotra', 'Principal District & Sessions Judge, South East District', 'Kailash Bhandari', '9910211464', 'pdsj-southeast@ddc.nic.in', '1762063888', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.southeast01', 0),
  ('South East - Saket.pdf', '2', 'Saket', 'South East', '018', 'Block-I', '', 'Ms. Ravinder Bedi', 'District Judge (Commercial Court)- 01', 'Dinesh Kumar', '9891909943', 'djcomm01-se@ddc.nic.in', '1766043838', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.southeast02', 0),
  ('South East - Saket.pdf', '3', 'Saket', 'South East', '014', 'Block-I', '', 'Sh. Lalit Kumar', 'District Judge (Commercial Court)- 02', 'Kavita Prabhal', '9971713713', 'djcomm02-se@ddc.nic.in', '25127354225', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.southeast03', 0),
  ('South East - Saket.pdf', '4', 'Saket', 'South East', '020', 'Block-I', '', 'Ms. Vrinda Kumari', 'District Judge (Commercial Court)- 03', 'Hemlata', '9958787613', 'djcomm03-se@ddc.nic.in', '25160855679', 'https://districtcourtdelhi.webex.com/meet/djcomm03-se', 0),
  ('South East - Saket.pdf', '5', 'Saket', 'South East', '021', 'Block-I', '', 'Dr. Rakesh Kumar-II', 'District Judge (Commercial Court)- 04', 'Savita Garva', '9971163257', 'djcomm04-se@ddc.nic.in', '25123991096', 'https://districtcourtdelhi.webex.com/meet/djcomm04-se', 0),
  ('South East - Saket.pdf', '6', 'Saket', 'South East', '022', 'Block-I', '', 'Ms. Neelam Singh', 'District Judge (Commercial Court)- 05', 'Akhilesh Upadhyay', '8744080403', 'djcomm05-se@ddc.nic.in', '25161727576', 'https://districtcourtdelhi.webex.com/meet/djcomm05-se', 0),
  ('South East - Saket.pdf', '7', 'Saket', 'South East', '023', 'Block-I', '', 'Dr. Neera Bharihoke', 'District Judge (Commercial Court)- 06', 'Mukesh Bala', '9910855530', 'djcomm06-se@ddc.nic.in', '25180667902', 'https://districtcourtdelhi.webex.com/meet/djcomm06-se', 0),
  ('South East - Saket.pdf', '8', 'Saket', 'South East', '030', 'Block-II', '', 'Dr. Tarun Sahrawat', 'District Judge (Commercial Court)- Digital- 07', 'Rajesh Kumar', '9958227234', 'djcommdc07-se@ddc.nic.in', '25168578623', 'https://districtcourtdelhi.webex.com/meet/djcommdc07-se', 0),
  ('South East - Saket.pdf', '9', 'Saket', 'South East', '039', 'Block-II', '', 'Ravinder Singh-I', 'District Judge (Commercial Court)- 08', 'Ramesh Godhwani', '9868581051', 'djcomm08-se@ddc.nic.in', '25131347410', 'https://districtcourtdelhi.webex.com/meet/djcomm08-se', 0),
  ('South East - Saket.pdf', '10', 'Saket', 'South East', '616', 'Main building', '', 'Ms. Bhavna Kalia', 'District Judge-01', 'Harendera Kumar Singh', '9810533964', 'adj01-southeast@ddc.nic.in', '1762512262', 'https://districtcourtdelhi.webex.com/meet/adj01southeast', 0),
  ('South East - Saket.pdf', '11', 'Saket', 'South East', '615', 'Main building', '', 'Sh. Rajinder Singh', 'District Judge-02', 'Ashok Kumar', '9810495173', 'adj02-southeast@ddc.nic.in', '1768939881', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.southeast05', 0),
  ('South East - Saket.pdf', '12', 'Saket', 'South East', '316', 'Main building', '', 'Sh. Atul Ahlawat', 'District Judge-03', 'Devender Kumar', '9664005314', 'adj03-southeast@ddc.nic.in', '1761795011', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.southeast06', 0);

INSERT INTO tmp_court_roster (source_file, source_row, court, district, court_no, building, floor, judge_name, designation, court_reader_name, court_reader_phone, court_email, vc_meeting_id, virtual_court_link, mahila_court) VALUES
  ('South East - Saket.pdf', '13', 'Saket', 'South East', '604', 'Main building', '', 'Sh. Pranjal Aneja', 'District Judge-04', 'Renu Rai', '9818286063', 'adj04-southeast@ddc.nic.in', '1765806813', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.southeast07', 0),
  ('South East - Saket.pdf', '14', 'Saket', 'South East', '612', 'Main building', '', 'Sh. Akash Jain', 'District Judge-05', 'Amit Choudhary', '8826602549', 'adj05-southeast@ddc.nic.in', '1767045929', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.southeast08', 0),
  ('South East - Saket.pdf', '15', 'Saket', 'South East', '310', 'Main building', '', 'Ms. Neha', 'District Judge-06', 'Rajiv Ojha', '8178849354', 'adj06-southeast@ddc.nic.in', '1767111193', 'https://districtcourtdelhi.webex.com/meet/adj06se', 0),
  ('South East - Saket.pdf', '16', 'Saket', 'South East', '001', 'Block-I', '', 'Ms. Richa Gusain Solanki', 'District Judge-07', 'Mukesh Mandal', '9968893620', 'adj07-southeast@ddc.nic.in', '25101267068', 'https://districtcourtdelhi.webex.com/meet/adj07-southeast', 0),
  ('South East - Saket.pdf', '17', 'Saket', 'South East', '315', 'Main building', '', 'Ms. Manu Vedwan', 'ASJ-01 (POCSO)', 'Mukesh Kumar', '9871202336', 'asjpocso01-se@ddc.nic.in', '1769789277', 'https://districtcourtdelhi.webex.com/meet/asj1southeast', 0),
  ('South East - Saket.pdf', '18', 'Saket', 'South East', '314', 'Main building', '', 'Ms. Sachin Jain', 'ASJ-02 / Special Court RPwD Act', 'Rakesh Kumar', '9718295524', 'asj02-southeast@ddc.nic.in', '1769556520', 'https://districtcourtdelhi.webex.com/meet/asj02southeast', 0),
  ('South East - Saket.pdf', '19', 'Saket', 'South East', '313', 'Main building', '', 'Sh. Anuj Aggarwal', 'ASJ-03', 'Brijesh Kumar Sharma', '9811072263', 'asj03-southeast@ddc.nic.in', '1768122169', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.southeast13', 0),
  ('South East - Saket.pdf', '20', 'Saket', 'South East', '312', 'Main building', '', 'Sh. Kumar Rajat', 'ASJ-04 + Special Judge (NDPS)', 'Neeraj Saini', '9999637891', 'asj04sjndps-se@ddc.nic.in', '1763274665', 'https://districtcourtdelhi.webex.com/meet/asj04southeast', 0),
  ('South East - Saket.pdf', '21', 'Saket', 'South East', '311', 'Main building', '', 'Sh. Anubhav Jain', 'ASJ-04', 'Sanjay Kr. Sayal', '9013473754', 'asj05-southeast@ddc.nic.in', '1767789614', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.southeast15', 0),
  ('South East - Saket.pdf', '22', 'Saket', 'South East', '309', 'Main building', '', 'Sh. Jagminder Singh', 'ASJ-06 (POCSO)', 'Preet Ansumala Lakra', '9318429177', 'asjpocso06-se@ddc.nic.in', '1762691734', 'https://districtcourtdelhi.webex.com/meet/asj06se', 0),
  ('South East - Saket.pdf', '23', 'Saket', 'South East', '305', 'Main building', '', 'Sh. Mohammad Ehtesham', 'ASJ-05', 'Sushil Kala', '8130708412', 'asj07-southeast@ddc.nic.in', '25140245266', 'https://districtcourtdelhi.webex.com/meet/asj07-southeast', 0),
  ('South East - Saket.pdf', '24', 'Saket', 'South East', '308', 'Main building', '', 'Ms. Swati Sharma', 'ASJ (FTSC) (POCSO)', 'Vinaysheel Sharma', '7678524240', 'asjftscpocso-se@ddc.nic.in', '1768847405', 'https://districtcourtdelhi.webex.com/meet/asjftscpocso', 0),
  ('South East - Saket.pdf', '25', 'Saket', 'South East', '607', 'Main building', '', 'Sh. Abhishek Kumar', 'ASJ (SC-POCSO)', 'Charan Dass', '9899973262', 'asjscpocso-se@ddc.nic.in', '25162473179', 'https://districtcourtdelhi.webex.com/meet/asjscpocso-se', 0),
  ('South East - Saket.pdf', '26', 'Saket', 'South East', '301', 'Main building', '', 'Sh. Ankit Singla', 'ASJ (Spl. Judge- FTC)', 'Neelama Saini', '9910972292', 'asjsjudgeftc-se@ddc.nic.in', '1763508732', 'https://districtcourtdelhi.webex.com/meet/asjftcsoutheast', 0),
  ('South East - Saket.pdf', '27', 'Saket', 'South East', '613', 'Main building', '', 'Ms. Shivani Chauhan', 'ASJ (FTC)-01', 'Narender Singh Patwal', '8383068516', 'asjftc01-se@ddc.nic.in', '25128010202', 'https://districtcourtdelhi.webex.com/meet/asjftc01-se', 0),
  ('South East - Saket.pdf', '28', 'Saket', 'South East', '614', 'Main building', '', 'Sh. Vinod Kumar Gautam', 'ASJ (FTC)-02', 'Raj Kishore', '9711760542', 'asjftc02-se@ddc.nic.in', '25103611949', 'https://districtcourtdelhi.webex.com/meet/asjftc02-se', 0),
  ('South East - Saket.pdf', '29', 'Saket', 'South East', '608', 'Main building', '', 'Sh. Vivek Kumar Gulia', 'ASJ (SC-RC)', 'Usha Allwyn', '9910735795', 'asjscrc-se@ddc.nic.in', '25141848352', 'https://districtcourtdelhi.webex.com/meet/asjscrc-se', 0),
  ('South East - Saket.pdf', '30', 'Saket', 'South East', '011', 'Main building', '', 'Sh. Sunil Beniwal', 'PO-MACT-01', 'Chetna Bhardwaj', '9540954211', 'delhisoutheast.mact@delhi.gov.in', '1765003331', 'https://districtcourtdelhi.webex.com/meet/pomactse', 0),
  ('South East - Saket.pdf', '31', 'Saket', 'South East', '013', 'Main building', '', 'Ms. Aditi Garg', 'PO-MACT-02', 'Sumeet', '9971801273', 'pomact02-se@ddc.nic.in', '25188740116', 'https://districtcourtdelhi.webex.com/meet/pomact02-se', 0),
  ('South East - Saket.pdf', '32', 'Saket', 'South East', '002', 'Main building', '', 'Sh. Fahad Uddin', 'SCJ-cum-RC', 'Mukesh Kumar', '9953122977', 'scjrc-southeast@ddc.nic.in', '1760098490', 'https://districtcourtdelhi.webex.com/meet/scjrcsoutheast', 0),
  ('South East - Saket.pdf', '33', 'Saket', 'South East', '002', 'Block-I', '', 'Sh. Ajeet Narayan', 'JSCC/ASCJ/GJ', 'Navin Bhadwaj', '9654932917', 'jsccascjgj-se@ddc.nic.in', '1769182667', 'https://districtcourtdelhi.webex.com/meet/ascjsoutheast', 0),
  ('South East - Saket.pdf', '34', 'Saket', 'South East', '203', 'Main building', '', 'Ms. Swayam Siddha Tripathi', 'ACJ-cum-CCJ-cum- ARC', 'Kamla', '9958122191', 'acjccjarc-se@ddc.nic.in', '1768436587', 'https://districtcourtdelhi.webex.com/meet/acjsoutheast203', 0),
  ('South East - Saket.pdf', '35', 'Saket', 'South East', '007', 'Block-I', '', 'Sh. Kashish Bajaj', 'CJ-01', 'Kamla Xalxo', '9650963068', 'cj01-southeast@ddc.nic.in', '1767162103', 'https://districtcourtdelhi.webex.com/meet/cj1southeast', 0),
  ('South East - Saket.pdf', '36', 'Saket', 'South East', '008', 'Block-I', '', 'Ms. Abhilasha Singh', 'CJ-02', 'Kamlesh', '8178596285', 'cj02-southeast@ddc.nic.in', '1769961159', 'https://districtcourtdelhi.webex.com/meet/cj02southeast', 0),
  ('South East - Saket.pdf', '37', 'Saket', 'South East', '011', 'Block-I', '', 'Ms. Vidushi Garg', 'CJ-03', 'Romanus Ekka', '9871784354', 'cj03-southeast@ddc.nic.in', '25122935163', 'https://districtcourtdelhi.webex.com/meet/cj03-southeast', 0),
  ('South East - Saket.pdf', '38', 'Saket', 'South East', '516', 'Main building', '', 'Sh. Abhinav Pandey', 'Chief Judicial Magistrate', 'Sanjay Kumar', '9210764392', 'cmm-southeast@ddc.nic.in', '1760627140', 'https://districtcourtdelhi.webex.com/meet/cmmsoutheast', 0),
  ('South East - Saket.pdf', '39', 'Saket', 'South East', '515', 'Main building', '', 'Ms. Naina Gupta', 'Additional Chief Judicial Magistrate', 'Sunil Dhyani', '8778248830', 'acmm-southeast@ddc.nic.in', '1763918330', 'https://districtcourtdelhi.webex.com/meet/acmmsoutheast515', 0),
  ('South East - Saket.pdf', '40', 'Saket', 'South East', '514', 'Main building', '', 'Sh. Rahul Jain', 'Judicial Magistrate First Class-01', 'Jyotish Toppo', '9818056924', 'mm01-southeast@ddc.nic.in', '1761205350', 'https://districtcourtdelhi.webex.com/meet/mm01secourt514', 0),
  ('South East - Saket.pdf', '41', 'Saket', 'South East', '513', 'Main building', '', 'Ms. Akansha Gautam', 'Judicial Magistrate First Class-02', 'Rajiv Kumar Sinha', '9953940444', 'mm02-southeast@ddc.nic.in', '1768545307', 'https://districtcourtdelhi.webex.com/meet/mm2saket', 0),
  ('South East - Saket.pdf', '42', 'Saket', 'South East', '512', 'Main building', '', 'Sh. Manuj Kaushal', 'Judicial Magistrate First Class-03', 'Shyam', '9891174721', 'mm03-southeast@ddc.nic.in', '1765543035', 'https://districtcourtdelhi.webex.com/meet/mm03-southeast', 0),
  ('South East - Saket.pdf', '43', 'Saket', 'South East', '010', 'Main building', '', 'Sh. Nidhish Kumar Meena', 'Judicial Magistrate First Class-04', 'Raj Kishore', '9911382630', 'mm04-southeast@ddc.nic.in', '1768343882', 'https://districtcourtdelhi.webex.com/meet/metromegistrate04', 0),
  ('South East - Saket.pdf', '44', 'Saket', 'South East', '510', 'Main building', '', 'Ms. Shikha Chahal', 'Judicial Magistrate First Class- 05', 'Ajay Soni', '8860638174', 'mm05-southeast@ddc.nic.in', '1763368606', 'https://districtcourtdelhi.webex.com/meet/mm5.sesaket', 0),
  ('South East - Saket.pdf', '45', 'Saket', 'South East', '509', 'Main building', '', 'Sh. Akhil Malik', 'Judicial Magistrate First Class-06', 'Yogesh', '9911805305', 'mm06-southeast@ddc.nic.in', '1765470306', 'https://districtcourtdelhi.webex.com/meet/mm06se', 0),
  ('South East - Saket.pdf', '46', 'Saket', 'South East', '508', 'Main building', '', 'Ms. Anam Rais Khan', 'Judicial Magistrate First Class-07', 'Ravi Sharma', '9868891746', 'mm07-southeast@ddc.nic.in', '1768011250', 'https://districtcourtdelhi.webex.com/meet/mm07se', 0),
  ('South East - Saket.pdf', '47', 'Saket', 'South East', '205', 'Main building', '', 'Sh. Ravi', 'Judicial Magistrate First Class- 08', 'Vinod Kumar', '9990343119', 'mm08-southeast@ddc.nic.in', '1768733893', 'https://districtcourtdelhi.webex.com/meet/mm08se', 0),
  ('South East - Saket.pdf', '48', 'Saket', 'South East', '206', 'Main building', '', 'Ms. Deepakshi Rana', 'Judicial Magistrate First Class- 09', 'Mukesh Kumar', '9899130874', 'mm09-southeast@ddc.nic.in', '1768377306', 'https://districtcourtdelhi.webex.com/meet/mm09southeast', 0),
  ('South East - Saket.pdf', '49', 'Saket', 'South East', '307', 'Main building', '', 'Sh. Kawal Singh', 'Judicial Magistrate First Class-10', 'Devender Rana', '9891371032', 'mm10-southeast@ddc.nic.in', '1768424601', 'https://districtcourtdelhi.webex.com/meet/mm10sed', 0),
  ('South East - Saket.pdf', '50', 'Saket', 'South East', '009', 'Main building', '', 'Dr. Raj Kumar Singh', 'Judicial Magistrate First Class-11', 'Charanjeet Singh', '9810775541', 'mm11-southeast@ddc.nic.in', '1767253834', 'https://districtcourtdelhi.webex.com/meet/mmelevense', 0),
  ('South East - Saket.pdf', '51', 'Saket', 'South East', '004', 'Main building', '', 'Ms. Deepika Thakran', 'Judicial Magistrate First Class-12', 'Bharat Bhushan', '8468930145', 'mm12-southeast@ddc.nic.in', '25172449003', 'https://districtcourtdelhi.webex.com/meet/mm12-southeast', 0),
  ('South East - Saket.pdf', '52', 'Saket', 'South East', '506', 'Main building', '', 'Ms. Shivangi Vyas', 'Judicial Magistrate First Class (Mahila Court)-01', 'Bharat Bhushan', '8745907735', 'mahilacourt01-se@ddc.nic.in', '1768882262', 'https://districtcourtdelhi.webex.com/meet/mahilacourt01sed', 1);

INSERT INTO tmp_court_roster (source_file, source_row, court, district, court_no, building, floor, judge_name, designation, court_reader_name, court_reader_phone, court_email, vc_meeting_id, virtual_court_link, mahila_court) VALUES
  ('South East - Saket.pdf', '53', 'Saket', 'South East', '507', 'Main building', '', 'Ms. Kanika Handa', 'Judicial Magistrate First Class (Mahila Court)-02', 'Pinki', '8368399085', 'mahilacourt02-se@ddc.nic.in', '1763839678', 'https://districtcourtdelhi.webex.com/meet/mmmahilacourt02sed', 1),
  ('South East - Saket.pdf', '54', 'Saket', 'South East', '005', 'Main building', '', 'Ms. Marilyn Joanna Khakha', 'Judicial Magistrate First Class (Mahila Court)-03', 'Antu Mittal', '9999680599', 'mahilacourt03-se@ddc.nic.in', '1760730407', 'https://districtcourtdelhi.webex.com/meet/mahilacourt03saket', 1),
  ('South East - Saket.pdf', '55', 'Saket', 'South East', '610', 'Main building', '', 'Ms. Poorva Mehra', 'Judicial Magistrate First Class(NI ACT)-01', 'Pratap Singh', '9899626206', 'mmniact01-se@ddc.nic.in', '25135911845', 'https://districtcourtdelhi.webex.com/meet/mmniact01-se', 0),
  ('South East - Saket.pdf', '56', 'Saket', 'South East', '609', 'Main building', '', 'Ms. Shruti Sharma-I', 'Judicial Magistrate First Class(NI ACT)-02', 'Bhupendra Kumar', '9818054201', 'mmniact02-se@ddc.nic.in', '25162821058', 'https://districtcourtdelhi.webex.com/meet/mmniact02-se', 0),
  ('South East - Saket.pdf', '57', 'Saket', 'South East', '007', 'Main building', '', 'Ms. Aastha Sharma', 'Judicial Magistrate First Class(NI ACT)-03', 'Nagendra Roy', '9868609501', 'mmniact03-se@ddc.nic.in', '1767731369', 'https://districtcourtdelhi.webex.com/meet/mm03.niact.se', 0),
  ('South East - Saket.pdf', '58', 'Saket', 'South East', '210', 'Main building', '', 'Ms. Seema Meena', 'Judicial Magistrate First Class(NI ACT)-04', 'Parveen Sharma', '7838869946', 'mmniact04-se@ddc.nic.in', '1766023493', 'https://districtcourtdelhi.webex.com/meet/mm04.niact.se', 0),
  ('South East - Saket.pdf', '59', 'Saket', 'South East', '038', 'Block-II', '', 'Ms. Shubhangi Srivastava', 'Judicial Magistrate First Class(NI ACT)-05', 'Ruchika Shukla', '9871671484', 'mmniact05-se@ddc.nic.in', '25131159696', 'https://districtcourtdelhi.webex.com/meet/mmniact05-se', 0),
  ('South East - Saket.pdf', '60', 'Saket', 'South East', '032', 'Block-II', '', 'Sh. Anurag Chhabra', 'Judicial Magistrate First Class(NI ACT)-06', 'Sohan Lal', '9315569731', 'mmniactdc01-se@ddc.nic.in', '1767099339', 'https://districtcourtdelhi.webex.com/meet/nisoutheast1', 0),
  ('South East - Saket.pdf', '61', 'Saket', 'South East', '033', 'Block-II', '', 'Sh. Mayank Aggarwal', 'Judicial Magistrate First Class(NI ACT)-07', 'Arun Yadav', '8800744962', 'mmniactdc02-se@ddc.nic.in', '1766988607', 'https://districtcourtdelhi.webex.com/meet/nisoutheast2', 0),
  ('South East - Saket.pdf', '62', 'Saket', 'South East', '034', 'Block-II', '', 'Ms. Surbhi Sharma', 'Judicial Magistrate First Class(NI ACT)-08', 'Vinay', '9540559192', 'mmniactdc03-se@ddc.nic.in', '1766350431', 'https://districtcourtdelhi.webex.com/meet/nisoutheast3', 0),
  ('South East - Saket.pdf', '63', 'Saket', 'South East', '027', 'Block-II', '', 'Ms. Nandini Garg', 'Judicial Magistrate First Class (Digital Traffic Court)', 'Pratima Singh', '9811669311', 'dtc-southeast@ddc.nic.in', '25168408760', 'https://districtcourtdelhi.webex.com/meet/dtc-southeast', 0),
  ('South East - Saket.pdf', '64', 'Saket', 'South East', '046', 'Block-II', '', 'Ms. Savita Rao', 'Principal Judge, Family Court', 'Naveen', '9811657621', 'pjfc-southeast@ddc.nic.in', '1707706728', 'https://districtcourtdelhi.webex.com/meet/familycourtsfilingsoutheast', 0),
  ('South East - Saket.pdf', '65', 'Saket', 'South East', '045', 'Block-II', '', 'Ms. Monika Saroha', 'Judge, Family Court-01', 'Nandan', '7838047423', 'jfc01-southeast@ddc.nic.in', '1768890279', 'https://districtcourtdelhi.webex.com/meet/fcsecourt04', 0),
  ('South East - Saket.pdf', '66', 'Saket', 'South East', '044', 'Block-II', '', 'Ms. Namrita Aggarwal', 'Judge, Family Court-02', 'Padmavathi', '9958891587', 'jfc02-southeast@ddc.nic.in', '25269608684', 'https://districtcourtdelhi.webex.com/meet/jfc02-southeast', 0),
  ('South Delhi - Saket.pdf', '1', 'Saket', 'South', '111', 'Main court building', '3rd floor', 'Sh. Sanjeev Kumar Aggarwal', 'Principal District & Sessions Judge (South)', 'Manoj Kumar Sharma', '9868263152', 'pdsj-south@ddc.nic.in', '1760723276', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.south01', 0),
  ('South Delhi - Saket.pdf', '2', 'Saket', 'South', '012', 'Block-I', '', 'Sh. Rakesh Pandit', 'District Judge Commercial-01', 'Anjali Kant', '9810704443', 'djcomm01-south@ddc.nic.in', '1762694138', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.south11', 0),
  ('South Delhi - Saket.pdf', '3', 'Saket', 'South', '006', 'Block-I', '', 'Sh. Saurabh Kulshreshtha', 'District Judge Commercial-02', 'Swaranlata Ekka', '8860180559', 'djcomm02-south@ddc.nic.in', '25112291621', 'https://districtcourtdelhi.webex.com/meet/djcomm02-south', 0),
  ('South Delhi - Saket.pdf', '4', 'Saket', 'South', '017', 'Block-I', '', 'Sh. Balwant Rai Bansal', 'District Judge Commercial-03', 'Geeta Rani', '9999976059', 'djcomm03-south@ddc.nic.in', '25160359479', 'https://districtcourtdelhi.webex.com/meet/djcomm03-south', 0),
  ('South Delhi - Saket.pdf', '5', 'Saket', 'South', '029', 'Block-II', '', 'Sh. Sudesh Kumar', 'District Judge Commercial-04 (Digital)', 'Jyoti Gupta', '8851960731', 'djcomm04dc-south@ddc.nic.in', '25100775763', 'https://districtcourtdelhi.webex.com/meet/djcomm04dc-south', 0),
  ('South Delhi - Saket.pdf', '6', 'Saket', 'South', '040', 'Block-II', '', 'Sh. Ajay Pandey', 'District Judge Commercial-05', 'Rati Ram', '7982935959', 'djcomm05-south@ddc.nic.in', '25195976865', 'https://districtcourtdelhi.webex.com/meet/djcomm05-south', 0),
  ('South Delhi - Saket.pdf', '7', 'Saket', 'South', '004', 'Block-I', '', 'Ms. Ambika Singh', 'District Judge-01', 'Sunil Kumar Mandal', '8595789659', 'adj01-south@ddc.nic.in', '1767684812', 'https://districtcourtdelhi.webex.com/meet/reader.adj01south', 0),
  ('South Delhi - Saket.pdf', '8', 'Saket', 'South', '015', 'Block-I', '', 'Sh. Arul Varma', 'District Judge-02', 'Swarneet Kaur', '9810459494', 'adj02-south@ddc.nic.in', '1764132301', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.south13', 0),
  ('South Delhi - Saket.pdf', '9', 'Saket', 'South', '016', 'Block-I', '', 'Sh. Mohinder Virat', 'District Judge-03', 'Sunil Kr. Ekka', '9999103818', 'adj03-south@ddc.nic.in', '25193367371', 'https://districtcourtdelhi.webex.com/meet/adj03-south', 0),
  ('South Delhi - Saket.pdf', '10', 'Saket', 'South', '031', 'Block-II', '', 'Ms. Shreya Arora Mehta', 'District Judge-04', 'Brijesh Verma', '8800889623', 'adj04-south@ddc.nic.in', '1768199371', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.south14', 0),
  ('South Delhi - Saket.pdf', '11', 'Saket', 'South', '019', 'Block-I', '', 'Sh. Subhash Kumar Mishra', 'District Judge-05', 'Ravi Sehgal', '9811363463', 'adj05-south@ddc.nic.in', '25139586369', 'https://districtcourtdelhi.webex.com/meet/adj05-south', 0),
  ('South Delhi - Saket.pdf', '12', 'Saket', 'South', '304', 'Main court building', '', 'Ms. Niti Phutela', 'ASJ (SFTC)', 'Md. Mushtaque', '9810986272', 'asjsftc-south@ddc.nic.in', '1769285295', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.south02', 0),
  ('South Delhi - Saket.pdf', '13', 'Saket', 'South', '302', 'Main court building', '', 'Ms. Mona Tardi Kerketta', 'ASJ-01(POCSO)', 'Neelam Rawat', '9540015783', 'asjpocso01-south@ddc.nic.in', '1763415956', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.south06', 0),
  ('South Delhi - Saket.pdf', '14', 'Saket', 'South', '303', 'Main court building', '', 'Sh. Samar Vishal', 'ASJ-02 / Special Court RPwD Act', 'Dhara Singh', '9911744860', 'asj02-south@ddc.nic.in', '1762188671', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.south05', 0),
  ('South Delhi - Saket.pdf', '15', 'Saket', 'South', '306', 'Main court building', '', 'Sh. Sonu Agnihotri', 'ASJ-03', 'Sunil Kumar Nautiyal', '9818135814', 'asj03-south@ddc.nic.in', '1767341488', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.south09', 0),
  ('South Delhi - Saket.pdf', '16', 'Saket', 'South', '501', 'Main court building', '', 'Ms. Manika', 'ASJ-04 (POCSO)', 'Neeta Gautam', '9711527599', 'asj04-south@ddc.nic.in', '1762575116', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.south07', 0),
  ('South Delhi - Saket.pdf', '17', 'Saket', 'South', '201', 'Main court building', '', 'Ms. Richa Parihar', 'ASJ-05', 'Mandeep Sherawat', '9711513089', 'asj05-south@ddc.nic.in', '25248786721', 'https://districtcourtdelhi.webex.com/meet/asj05-south', 0),
  ('South Delhi - Saket.pdf', '18', 'Saket', 'South', '511', 'Main court building', '', 'Sh. Pawan Kumar', 'ASJ-06', 'Tara Singh Bisht', '9999341571', 'asj06-south@ddc.nic.in', '25258685921', 'https://districtcourtdelhi.webex.com/meet/asj06-south', 0),
  ('South Delhi - Saket.pdf', '19', 'Saket', 'South', '605', 'Main court building', '', 'Sh. Vinod Kumar Meena', 'ASJ (FTSC) (POCSO)', 'Surya Prakash', '9891878308', 'asjftscpocso-st@ddc.nic.in', '25170245401', 'https://districtcourtdelhi.webex.com/meet/asjftscpocso-st', 0),
  ('South Delhi - Saket.pdf', '20', 'Saket', 'South', '504', 'Main court building', '', 'Sh. Ranjeet Singh', 'ASJ (Electricity)', 'Chandan Singh Vora', '783887267', 'asjelectric-st@ddc.nic.in', '1761098795', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.south04', 0),
  ('South Delhi - Saket.pdf', '21', 'Saket', 'South', '505', 'Main court building', '', 'Sh. Dheeraj Mor', 'Spl. Judge (NDPS)', 'Babita Tokas', '9873208266', 'spljudgendps-st@ddc.nic.in', '1760463257', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.south03', 0),
  ('South Delhi - Saket.pdf', '22', 'Saket', 'South', '503', 'Main court building', '', 'Sh. Hargurvarinder S. Jaggi', 'ASJ (FTC)-01', 'Chetali Sachdeva', '9910069848', 'asjftc01-south@ddc.nic.in', '25181812904', 'https://districtcourtdelhi.webex.com/meet/asjftc01-south', 0),
  ('South Delhi - Saket.pdf', '23', 'Saket', 'South', '502', 'Main court building', '', 'Ms. Shunali Gupta', 'ASJ (FTC)-02', 'Manju Kanojia', '8920812879', 'asjftc02-south@ddc.nic.in', '25204002513', 'https://districtcourtdelhi.webex.com/meet/asjftc02-south', 0),
  ('South Delhi - Saket.pdf', '24', 'Saket', 'South', '601', 'Main court building', '', 'Ms. Nabeela Wali', 'ASJ (SC-RC)', 'Arvind Kumar', '9868223810', 'asjscrc-south@ddc.nic.in', '25186812587', 'https://districtcourtdelhi.webex.com/meet/asjscrc-south', 0),
  ('South Delhi - Saket.pdf', '25', 'Saket', 'South', '606', 'Main court building', '', 'Sh. Rahul Bhatia', 'ASJ (SC-POCSO)', 'Mukesh Duharia', '9811535817', 'asjscpocso-south@ddc.nic.in', '25111071420', 'https://districtcourtdelhi.webex.com/meet/asjscpocso-south', 0),
  ('South Delhi - Saket.pdf', '26', 'Saket', 'South', '014', 'Main court building', '', 'Ms. Anjani Mahajan', 'PO-MACT', 'Kamal Narula', '9810965876', 'delhisouth.mact@delhi.gov.in', '1762617459', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.south10', 0);

INSERT INTO tmp_court_roster (source_file, source_row, court, district, court_no, building, floor, judge_name, designation, court_reader_name, court_reader_phone, court_email, vc_meeting_id, virtual_court_link, mahila_court) VALUES
  ('South Delhi - Saket.pdf', '27', 'Saket', 'South', '001', 'Main court building', '', 'Sh. Pranav Joshi', 'SCJ-RC', 'Preeti Chauhan', '9891481855', 'scjrc-south@ddc.nic.in', '1769272631', 'https://districtcourtdelhi.webex.com/meet/reader.scjsouth', 0),
  ('South Delhi - Saket.pdf', '28', 'Saket', 'South', '003', 'Block-I', '', 'Sh. Vinik Jain', 'JSCC-CUM-ASCJ-GJ', 'Meena Rawat', '8826644238', 'jsccascjgj-south@ddc.nic.in', '1764314534', 'https://districtcourtdelhi.webex.com/meet/reader.ascjsouth', 0),
  ('South Delhi - Saket.pdf', '29', 'Saket', 'South', '204', 'Main court building', '', 'Ms. Shilpi Singh', 'ACJ / CCJ / ARC', 'Anita Ralhan', '9999249976', 'acjccjarc-south@ddc.nic.in', '1767840620', 'https://districtcourtdelhi.webex.com/meet/reader.acjsouth', 0),
  ('South Delhi - Saket.pdf', '30', 'Saket', 'South', '009', 'Block-I', '', 'Sh. Ankit Garg', 'CJ-01', 'Arushi Rawat', '9810737604', 'cj01-south@ddc.nic.in', '1763291339', 'https://districtcourtdelhi.webex.com/meet/reader.cj01south', 0),
  ('South Delhi - Saket.pdf', '31', 'Saket', 'South', '010', 'Block-I', '', 'Sh. Harshal Negi', 'CJ-02', 'Rajesh Peter', '8130375204', 'cj02-south@ddc.nic.in', '25134448517', 'https://districtcourtdelhi.webex.com/meet/cj02-south', 0),
  ('South Delhi - Saket.pdf', '32', 'Saket', 'South', '216', 'Main court building', '', 'Ms. Niharika Kumar Sharma', 'Chief Judicial Magistrate', 'Sukhranjan Mistry', '9891391034', 'cmm-south@ddc.nic.in', '25151685394', 'https://districtcourtdelhi.webex.com/meet/readercmmsouth', 0),
  ('South Delhi - Saket.pdf', '33', 'Saket', 'South', '215', 'Main court building', '', 'Ms. Tarunpreet Kaur', 'Additional Chief Judicial Magistrate', 'Harish Kumar', '7840047631', 'acmm-south@ddc.nic.in', '1766804531', 'https://districtcourtdelhi.webex.com/meet/readeracmmsouth', 0),
  ('South Delhi - Saket.pdf', '34', 'Saket', 'South', '214', 'Main court building', '', 'Ms. Shivli Talwar', 'Judicial Magistrate First Class-01', 'Alok Jetly', '9999021908', 'mm01-south@ddc.nic.in', '1761753068', 'https://districtcourtdelhi.webex.com/meet/readermm01south', 0),
  ('South Delhi - Saket.pdf', '35', 'Saket', 'South', '213', 'Main court building', '', 'Sh. Bhanu Pratap Singh', 'Judicial Magistrate First Class-02', 'Leela Bisht', '8860231501', 'mm02-south@ddc.nic.in', '1767730535', 'https://districtcourtdelhi.webex.com/meet/readermm02south', 0),
  ('South Delhi - Saket.pdf', '36', 'Saket', 'South', '212', 'Main court building', '', 'Ms. Devanshi Janmeja', 'Judicial Magistrate First Class-03', 'Kripa', '9899973733', 'mm03-south@ddc.nic.in', '1767787255', 'https://districtcourtdelhi.webex.com/meet/readermm03south', 0),
  ('South Delhi - Saket.pdf', '37', 'Saket', 'South', '211', 'Main court building', '', 'Sh. Chatinder Singh', 'Judicial Magistrate First Class-04', 'Gautam Bhunia', '9717962287', 'mm04-south@ddc.nic.in', '1766470425', 'https://districtcourtdelhi.webex.com/meet/readermm04south', 0),
  ('South Delhi - Saket.pdf', '38', 'Saket', 'South', '003', 'Main court building', '', 'Sh. Shivam Gupta', 'Judicial Magistrate First Class-05', 'Ravinder Kumar Shami', '9910809207', 'mm05-south@ddc.nic.in', '25157361514', 'https://districtcourtdelhi.webex.com/meet/mm05-south', 0),
  ('South Delhi - Saket.pdf', '39', 'Saket', 'South', '008', 'Main court building', '', 'Sh. Yashdeep Chahal', 'Judicial Magistrate First Class-06', 'L. Baxala', '9818767655', 'mm06-south@ddc.nic.in', '25134175400', 'https://districtcourtdelhi.webex.com/meet/mm06-south', 0),
  ('South Delhi - Saket.pdf', '40', 'Saket', 'South', '208', 'Main court building', '', 'Ms. Aneeza Bishnoi', 'Judicial Magistrate First Class (Mahila Court)-01', 'Sunil', '9968652568', 'mahilacourt01-st@ddc.nic.in', '1761684651', 'https://districtcourtdelhi.webex.com/meet/readermm01mahilacourtsouth', 1),
  ('South Delhi - Saket.pdf', '41', 'Saket', 'South', '209', 'Main court building', '', 'Ms. Chayya Tyagi', 'Judicial Magistrate First Class (Mahila Court)-02', 'Daizy Gandhi', '9650947579', 'mahilacourt02-st@ddc.nic.in', '1761663388', 'https://districtcourtdelhi.webex.com/meet/readermm02mahilacourtsouth', 1),
  ('South Delhi - Saket.pdf', '42', 'Saket', 'South', '012', 'Main court building', '', 'Ms. Neetika Kapoor', 'Judicial Magistrate First Class (Mahila Court) -03', 'Mukesh', '9868448617', 'mahilacourt03-st@ddc.nic.in', '1761344405', 'https://districtcourtdelhi.webex.com/meet/readermm03mahilacourtsouth', 1),
  ('South Delhi - Saket.pdf', '43', 'Saket', 'South', '006', 'Main court building', '', 'Ms. Sana Khan', 'Judicial Magistrate First Class (Mahila Court)-04', 'Rajni Chattwal', '9810219271', 'mahilacourt04-st@ddc.nic.in', '1769205684', 'https://districtcourtdelhi.webex.com/meet/readermm04mahilacourtsouth', 1),
  ('South Delhi - Saket.pdf', '44', 'Saket', 'South', '611', 'Main court building', '', 'Ms. Radha Kulshreshtha', 'Judicial Magistrate First Class (NI-Act)-01', 'Anuj Awasthi', '9311034722', 'mmniact01-south@ddc.nic.in', '1766789873', 'https://districtcourtdelhi.webex.com/meet/readermm01niasouth', 0),
  ('South Delhi - Saket.pdf', '45', 'Saket', 'South', '603', 'Main court building', '', 'Ms. Ariba Khan', 'Judicial Magistrate First Class (NI-Act)-02', 'Rajni', '9311319302', 'mmniact02-south@ddc.nic.in', '1769825796', 'https://districtcourtdelhi.webex.com/meet/readermm02niasouth', 0),
  ('South Delhi - Saket.pdf', '46', 'Saket', 'South', '207', 'Main court building', '', 'Ms. Ankita Bhatia', 'Judicial Magistrate First Class (NI-Act)-03', 'Jyoti Kumar', '9910405690', 'mmniact03-south@ddc.nic.in', '1763763995', 'https://districtcourtdelhi.webex.com/meet/readermmnia03south', 0),
  ('South Delhi - Saket.pdf', '47', 'Saket', 'South', '202', 'Main court building', '', 'Sh. Shiva Parashar', 'Judicial Magistrate First Class (NI-Act)-04', 'Archana Saini', '9958352775', 'mmniact04-south@ddc.nic.in', '1762474489', 'https://districtcourtdelhi.webex.com/meet/readermm04niasouth', 0),
  ('South Delhi - Saket.pdf', '48', 'Saket', 'South', '013', 'Block-I', '', 'Sh. Nitin Shah', 'Judicial Magistrate First Class (NI-Act)-05', 'Gaurav bhutani', '981132254', 'mmniact05-south@ddc.nic.in', '1765700934', 'https://districtcourtdelhi.webex.com/meet/readermm05niasouth', 0),
  ('South Delhi - Saket.pdf', '49', 'Saket', 'South', '035', 'Block-II', '', 'Ms. Archita Garg', 'Judicial Magistrate First Class (NI-Act)-06', 'Bindu Gandhi', '9310128351', 'mmniact06-south@ddc.nic.in', '25156161279', 'https://districtcourtdelhi.webex.com/meet/mmniact06-south', 0),
  ('South Delhi - Saket.pdf', '50', 'Saket', 'South', '036', 'Block-II', '', 'Sh. Jayanti Chander', 'Judicial Magistrate First Class (NI-Act)-07', 'Raju', '8800240641', 'mmniact07-south@ddc.nic.in', '25185880684', 'https://districtcourtdelhi.webex.com/meet/mmniact07-south', 0),
  ('South Delhi - Saket.pdf', '51', 'Saket', 'South', '037', 'Block-II', '', 'Sh. Akshay Sharma', 'Judicial Magistrate First Class (NI-Act)-08', 'Veena Satewal', '8920876631', 'mmniact08-south@ddc.nic.in', '25141160147', 'https://districtcourtdelhi.webex.com/meet/mmniact08-south', 0),
  ('South Delhi - Saket.pdf', '52', 'Saket', 'South', '024', 'Block-II', '', 'Sh. Sidhant Krishan Singh', 'Judicial Magistrate First Class(NI ACT)-09', 'Nandini Kujur', '9911814518', 'mmniactdc1-south@ddc.nic.in', '1760230932', 'https://districtcourtdelhi.webex.com/meet/nisouth01', 0),
  ('South Delhi - Saket.pdf', '53', 'Saket', 'South', '025', 'Block-II', '', 'Ms. Sanghmitra', 'Judicial Magistrate First Class(NI ACT)-10', 'Dalip Mandal', '9999052772', 'mmniactdc2-south@ddc.nic.in', '1843508834', 'https://districtcourtdelhi.webex.com/meet/nisouth2', 0),
  ('South Delhi - Saket.pdf', '54', 'Saket', 'South', '026', 'Block-II', '', 'Ms. Anshul Agnihotri', 'Judicial Magistrate First Class(NI ACT)-11', 'Ritesh', '8700980412', 'mmniactdc3-south@ddc.nic.in', '1761082352', 'https://districtcourtdelhi.webex.com/meet/nisouth3', 0),
  ('South Delhi - Saket.pdf', '56', 'Saket', 'South', '028', 'Block-II', '', 'Ms. Kamaldeep Kaur', 'Judicial Magistrate First Class (Digital Traffic Court)', 'Mukesh Kumar', '9873528120', 'dtc01.south@ddc.nic.in', '25130081059', 'https://districtcourtdelhi.webex.com/meet/dtc01.south', 0),
  ('South Delhi - Saket.pdf', '57', 'Saket', 'South', '042', 'Block-II', '', 'Sh. M.K. Nagpal', 'Principal Judge, Family Court, South', 'Abhay Prasad', '9268726253', 'pjfc-south@ddc.nic.in', '1704963531', 'https://districtcourtdelhi.webex.com/meet/familycourtsfilingsouth', 0),
  ('South Delhi - Saket.pdf', '58', 'Saket', 'South', '041', 'Block-II', '', 'Ms. Purva Sareen', 'Judge Family Court-01', 'Ruby Gosain', '9891039280', 'jfc01-south@ddc.nic.in', '25272758647', 'https://districtcourtdelhi.webex.com/meet/jfc01-south', 0),
  ('South Delhi - Saket.pdf', '59', 'Saket', 'South', '043', 'Block-II', '', 'Ms. Vandana Jain', 'Judge, Family Court-02', 'Kamini', '9555044062', 'jfc02-south@ddc.nic.in', '25131973485', 'https://districtcourtdelhi.webex.com/meet/jfc02-south', 0),
  ('West.pdf', '1', 'Tis Hazari', 'West', '', '', '', 'Sh. Pitamber Dutt', 'Ld. Principal District & Session Judge (West)', 'Sh. Manohar Lal', '9810503304', 'pdsj-west@ddc.nic.in', '1762281360', 'https://districtcourtdelhi.webex.com/meet/readerdjwest', 0),
  ('West.pdf', '2', 'Tis Hazari', 'West', '', '', '', 'Sh. Shivaji Anand', 'Ld. ASJ–06 (POCSO)', 'Sh Kuldeep Singh Rawat', '9811772625', 'asjpocso06-west@ddc.nic.in', '1767865110', 'https://districtcourtdelhi.webex.com/meet/readerasj06west', 0),
  ('West.pdf', '3', 'Tis Hazari', 'West', '', '', '', 'Sh. Rajesh Kumar Singh', 'Ld. Pr. Judge, Family Court', 'Sh. Rajesh Dhoon', '9871913122', 'pjfc-west@ddc.nic.in', '1765966654', 'https://districtcourtdelhi.webex.com/meet/ddc.pjfc.west', 0),
  ('West.pdf', '4', 'Tis Hazari', 'West', '', '', '', 'Sh Jitendra Singh', 'Ld. APJ Family Court', 'Ms Pooja Sharma', '9891303593', 'jfc01-west@ddc.nic.in', '1766041853', 'https://districtcourtdelhi.webex.com/meet/reader02apjfamilycourt', 0),
  ('West.pdf', '5', 'Tis Hazari', 'West', '', '', '', 'Ms. Manjusha Wadhwa', 'Ld. DJ. Comm– 01', 'Sh. Ajeet Kumar', '9560015497', 'djcomm01-west@ddc.nic.in', '1764409487', 'https://districtcourtdelhi.webex.com/meet/readerdjcomm01west', 0),
  ('West.pdf', '6', 'Tis Hazari', 'West', '', '', '', 'Ms. Raj Rani', 'Ld. DJ. Comm- 02', 'Sh. Sunil Kumar', '9650532955', 'djcomm02-west@ddc.nic.in', '1761826852', 'https://districtcourtdelhi.webex.com/meet/readerdjcomm02west', 0),
  ('West.pdf', '7', 'Tis Hazari', 'West', '', '', '', 'Sh. Raghubir Singh', 'Ld. DJ Comm- 03', 'Sh Ashok Kumar', '9213928263', 'djcomm03-west@ddc.nic.in', '25125714437', 'https://districtcourtdelhi.webex.com/meet/djcomm03-west', 0),
  ('West.pdf', '8', 'Tis Hazari', 'West', '', '', '', 'Sh Harish Kumar', 'DJ (COMMERCIAL)-04', 'Sh Raj Kumar Arora', '9013227739', 'djcomm04-west@ddc.nic.in', '25163589292', 'https://districtcourtdelhi.webex.com/meet/djcomm04-west', 0);

INSERT INTO tmp_court_roster (source_file, source_row, court, district, court_no, building, floor, judge_name, designation, court_reader_name, court_reader_phone, court_email, vc_meeting_id, virtual_court_link, mahila_court) VALUES
  ('West.pdf', '9', 'Tis Hazari', 'West', '', '', '', 'Sh Raj Kumar Tripathi', 'DJ (COMMERCIAL)-05', 'Sh. Rajeev Kumar', '9899014607', 'djcomm05-west@ddc.nic.in', '25189419333', 'https://districtcourtdelhi.webex.com/meet/djcomm05-west', 0),
  ('West.pdf', '10', 'Tis Hazari', 'West', '', '', '', 'Ms. Neelofer Abida Perveen', 'DJ (COMMERCIAL)-06', 'Ms. Seema', '9891088938', 'djcomm06-west@ddc.nic.in', '25158205213', 'https://districtcourtdelhi.webex.com/meet/djcomm06-west', 0),
  ('West.pdf', '11', 'Tis Hazari', 'West', '', '', '', 'Sh. Jitendra Pratap Singh', 'DJ -08', NULL, NULL, 'dj08-west@ddc.nic.in', '25158068864', 'https://districtcourtdelhi.webex.com/meet/dj08west', 0),
  ('West.pdf', '12', 'Tis Hazari', 'West', '', '', '', 'Sh. Naveen Gupta', 'DJ -09', 'Ms. Pratibha Chaudhary', '9811597047', 'dj09west@gmail.com', '25180117900', 'https://districtcourtdelhi.webex.com/meet/dj09west', 0),
  ('West.pdf', '13', 'Tis Hazari', 'West', '', '', '', 'Sh. Chander Kirti Negi', 'Ld. ADJ-010', 'Ms. Jyoti Bandhu', '9899920407', 'dj10-west@ddc.nic.in', '25131920659', 'https://districtcourtdelhi.webex.com/meet/dj10westthc', 0),
  ('West.pdf', '14', 'Tis Hazari', 'West', '', '', '', 'Ms. Riya Guha', 'Ld. ADJ- 02', 'Sh. Pawan Gupta', '9311256303', 'adj02-west@ddc.nic.in', '1769086780', 'https://districtcourtdelhi.webex.com/meet/readeradj02west', 0),
  ('West.pdf', '15', 'Tis Hazari', 'West', '', '', '', 'Sh. Anurag Dass', 'Ld. PO-MACT– 02', 'Sh. Bharat Kumar', '9958598049', 'delhiwest.mact02@delhi.gov.in', '1767167414', 'https://districtcourtdelhi.webex.com/meet/mact2westthc', 0),
  ('West.pdf', '16', 'Tis Hazari', 'West', '', '', '', 'Sh. Lovleen', 'Ld. Judge Family Court', 'Sh. Satheesh', '8816913871', 'jfc02-west@ddc.nic.in', '1769815322', 'https://districtcourtdelhi.webex.com/meet/readerjfcwest', 0),
  ('West.pdf', '17', 'Tis Hazari', 'West', '', '', '', 'Dr. Yadvender Singh', 'Ld. ASJ- 05', 'Sh. Khyali Ram', '9555067032', 'asj05-west@ddc.nic.in', '1761674350', 'https://districtcourtdelhi.webex.com/meet/asj05west', 0),
  ('West.pdf', '18', 'Tis Hazari', 'West', '', '', '', 'Sh. Sunil Choudhary', 'Ld. ADJ-01', 'Sh Sanjay Saini', '8168782458', 'adj01-west@ddc.nic.in', '1764403020', 'https://districtcourtdelhi.webex.com/meet/readeradj01west', 0),
  ('West.pdf', '19', 'Tis Hazari', 'West', '', '', '', 'Ms. Priya Mahendra', 'Ld. ASJ- 09', 'Sh. Vikas', '9810742064', 'asj09-west@ddc.nic.in', '1763059351', 'https://districtcourtdelhi.webex.com/meet/asj9west', 0),
  ('West.pdf', '20', 'Tis Hazari', 'West', '', '', '', 'Ms Gunjan Gupta', 'Ld. MACT- 01', 'Sh. Lalit Gola', '9811807670', 'delhiwest.mact01@delhi.gov.in', '1760827025', 'https://districtcourtdelhi.webex.com/meet/readermact01west', 0),
  ('West.pdf', '21', 'Tis Hazari', 'West', '', '', '', 'Sh Dheeraj Mittal', 'Ld. ASJ- 04', 'Sh. Bhumesh Chander Vashisth', '9468110320', 'asj04-west@ddc.nic.in', '1766362423', 'https://districtcourtdelhi.webex.com/meet/readerasj04west', 0),
  ('West.pdf', '22', 'Tis Hazari', 'West', '', '', '', 'Sh. Sunil Kumar', 'Ld. ASJ - 07 (POCSO)', 'Ms. Lalita Verma', '9871165476', 'asjpocso07-west@ddc.nic.in', '1764241414', 'https://districtcourtdelhi.webex.com/meet/ddcvcwest07', 0),
  ('West.pdf', '23', 'Tis Hazari', 'West', '', '', '', 'Sh. Gajender Singh Nagar', 'Ld. ASJ- 02', 'Sh. Rajesh Khanna', '9818535954', 'asj02-west@ddc.nic.in', '1761527695', 'https://districtcourtdelhi.webex.com/meet/readerasj02west', 0),
  ('West.pdf', '24', 'Tis Hazari', 'West', '', '', '', 'Ms. Chhavi kapoor', 'Ld. ASJ- 01 (POCSO)', 'Sh. Chander Kant', '9910631261', 'asjpocso01-west@ddc.nic.in', '25187133117', 'https://districtcourtdelhi.webex.com/meet/asjpocso01-west', 0),
  ('West.pdf', '25', 'Tis Hazari', 'West', '', '', '', 'Sh. Rajinder kumar', 'Ld. ASJ- 03', 'Sh. Kamal', '9211324498', 'asj03-west@ddc.nic.in', '1765481449', 'https://districtcourtdelhi.webex.com/meet/asj03west', 0),
  ('West.pdf', '26', 'Tis Hazari', 'West', '', '', '', 'Sh. Shailender Malik', 'Ld. Spl. Judge, NDPS', 'Sh. Sunil Kumar', '9818947879', 'sjndps-west@ddc.nic.in', '1767254143', 'https://districtcourtdelhi.webex.com/meet/staffndpscourtwest', 0),
  ('West.pdf', '27', 'Tis Hazari', 'West', '', '', '', 'Ms. Archana Bhalla', 'ASJ (SC-RC)-02', 'Sh. Harkesh Kumar Yadav', '9911110930', 'asjscrc02-west@ddc.nic.in', '25168527474', 'https://districtcourtdelhi.webex.com/meet/asjscrc02-west', 0),
  ('West.pdf', '28', 'Tis Hazari', 'West', '', '', '', 'Sh. Shiv Kumar', 'ASJ-02', 'Ms. Shailja Malhotra', '9810483415', 'asjftc02-west@ddc.nic.in', '25163412670', 'https://districtcourtdelhi.webex.com/meet/asjftc02-west', 0),
  ('West.pdf', '29', 'Tis Hazari', 'West', '', '', '', 'Ms. Pooja Talwar', 'ASJ (FTC)-01', 'Sh. Yogesh', '9711269891', 'asjftc01-west@ddc.nic.in', '25136568693', 'https://districtcourtdelhi.webex.com/meet/asjftc01-west', 0),
  ('West.pdf', '30', 'Tis Hazari', 'West', '', '', '', 'Sh Puneet Nagpal', 'ASJ (SC-POCSO)-02', 'Sh. RISHI PAL', '8076071742', 'asjscpocso02-wt@ddc.nic.in', '25118202585', 'https://districtcourtdelhi.webex.com/meet/asjscpocso02-wt', 0),
  ('West.pdf', '32', 'Tis Hazari', 'West', '', '', '', 'Ms. Goma Dabas Gupta', 'Ld.ADJ- 06', 'Ms Madhu Kansotia', '9873410714', 'adj06-west@ddc.nic.in', '1760361579', 'https://districtcourtdelhi.webex.com/meet/adj06wd', 0),
  ('West.pdf', '33', 'Tis Hazari', 'West', '', '', '', 'Sh. Gagandeep Jindal', 'Ld. ADJ- 03', 'Sh. Ajay kumar tiwari', '8700183091', 'adj03-west@ddc.nic.in', '1765900729', 'https://districtcourtdelhi.webex.com/meet/readeradj03westdistrict', 0),
  ('West.pdf', '34', 'Tis Hazari', 'West', '', '', '', 'Sh Arvind Bansal', 'Ld. ADJ- 05', 'Ms. Kulvinder Kaur', '9716001172', 'adj05-west@ddc.nic.in', '1769785659', 'https://districtcourtdelhi.webex.com/meet/readeradj05', 0),
  ('West.pdf', '35', 'Tis Hazari', 'West', '', '', '', 'Sh Sunil Kumar Sharma', 'Ld. ADJ- 04', 'Ms. Mamta', '9911448298', 'adj04-west@ddc.nic.in', '1765212780', 'https://districtcourtdelhi.webex.com/meet/adj04west', 0),
  ('West.pdf', '36', 'Tis Hazari', 'West', '', '', '', 'Sh. Atul Krishna Agrawal', 'Ld. ASJ- 08', 'Sh. Ashok Kumar Dimri', '9818534149', 'asj08-west@ddc.nic.in', '1760525559', 'https://districtcourtdelhi.webex.com/meet/readerasj08west', 0),
  ('West.pdf', '37', 'Tis Hazari', 'West', '', '', '', 'Sh Santosh Kumar Sharma', 'Ld. ADJ- 07', 'Sh. Sanjay Kumar', '9716110587', 'adj08-west@ddc.nic.in', '1705355319', 'https://districtcourtdelhi.webex.com/meet/adj08west', 0),
  ('West.pdf', '38', 'Tis Hazari', 'West', '', '', '', 'Sh. Deepak Kumar-II', 'Ld. ASJ/FTSC/RC- 01', 'Sh. Rajesh Kanojia', '8586865545', 'asjftscrc01-west@ddc.nic.in', '1766393855', 'https://districtcourtdelhi.webex.com/meet/asjftscrc01', 0),
  ('West.pdf', '39', 'Tis Hazari', 'West', '', '', '', 'Sh. Sunil Gupta', 'Ld. ASJ/FTSC/RC- 02', 'Sh. Ajay kumar', '8851097402', 'asjftscrc02-west@ddc.nic.in', '1767868573', 'https://districtcourtdelhi.webex.com/meet/readerasjftscrc02', 0),
  ('West.pdf', '40', 'Tis Hazari', 'West', '', '', '', 'Sh. Arun Kumar Garg', 'Ld. ASJ/FTSC/RC- 02', 'Sh. Madan Mohan', '9654462852', 'asjscrc01-west@ddc.nic.in', '25124270276', 'https://districtcourtdelhi.webex.com/meet/asjscrc01-west', 0),
  ('West.pdf', '41', 'Tis Hazari', 'West', '', '', '', 'Sh. Sushil Kumar', 'Ld. ASJ(SCPOCSO)', 'Sh. Naresh Khurana', '9868576376', 'asjscpocso01-wt@ddc.nic.in', '25178671480', 'https://districtcourtdelhi.webex.com/meet/asjscpocso01-wt', 0),
  ('West.pdf', '42', 'Tis Hazari', 'West', '', '', '', 'Sh. Purshotam Pathak', 'Ld. ASJ/FTSC/ POSCO- 02', 'Sh. Sunil', '9654929366', 'asjftscpocso2-wt@ddc.nic.in', '1764677611', 'https://districtcourtdelhi.webex.com/meet/asjftscpocso02', 0),
  ('West.pdf', '43', 'Tis Hazari', 'West', '', '', '', 'Ms. Saloni Singh', 'Ld. ASJ/FTSC/ POSCO- 01', 'Sh. Arun Meena', '9971664443', 'asjftscpocso1-wt@ddc.nic.in', '1762252192', 'https://districtcourtdelhi.webex.com/meet/asjreaderwest01', 0),
  ('West.pdf', '44', 'Tis Hazari', 'West', '', '', '', 'Ms. Vasundhara Azad', 'Ld. CJM', 'Sh. Kamal Kishore', '8368948604', 'cmm-west@ddc.nic.in', '1767705391', 'https://districtcourtdelhi.webex.com/meet/cmmcourtwest.reader', 0),
  ('West.pdf', '45', 'Tis Hazari', 'West', '', '', '', 'Ms Richa Sharma', 'Ld. SCJ cum RC', 'Sh Surender Singh', '8750195683', 'scjrc-west@ddc.nic.in', '1769681848', 'https://districtcourtdelhi.webex.com/meet/readerscjwest', 0),
  ('West.pdf', '46', 'Tis Hazari', 'West', '', '', '', 'Ms Shruti Chaudhary', 'Ld. ACJM', 'Sh. Mohan Bahadur', '9811915273', 'acmm-west@ddc.nic.in', '1766172570', 'https://districtcourtdelhi.webex.com/meet/readeracmmwest', 0),
  ('West.pdf', '47', 'Tis Hazari', 'West', '', '', '', 'Ms. Neha Pandey', 'Ld. JSCC/ASCJ/GJ', 'Sh. Rajesh Monga', '9910043449', 'jsccascjgj-west@ddc.nic.in', '1767638952', 'https://districtcourtdelhi.webex.com/meet/ascjwest2', 0),
  ('West.pdf', '48', 'Tis Hazari', 'West', '', '', '', 'Sh. Vivek Kumar Agarwal', 'Ld. JSCC/ASCJ/GJ-02', NULL, NULL, 'jsccascjgj02-wt@ddc.nic.in', '25146287800', 'https://districtcourtdelhi.webex.com/meet/jsccascjgj02west', 0),
  ('West.pdf', '49', 'Tis Hazari', 'West', '', '', '', 'Sh Anshul Mehta', 'Ld. ACJ', 'Sh. Sanjay Kumar', '9910082587', 'cjccjarc-west@ddc.nic.in', '25117407256', 'https://districtcourtdelhi.webex.com/meet/cjccjarc-west', 0);

INSERT INTO tmp_court_roster (source_file, source_row, court, district, court_no, building, floor, judge_name, designation, court_reader_name, court_reader_phone, court_email, vc_meeting_id, virtual_court_link, mahila_court) VALUES
  ('West.pdf', '50', 'Tis Hazari', 'West', '', '', '', 'Ms. Shazadi Halima Sadiya', 'Ld. JMFC- 01', 'Sh. Yogender', '9899333026', 'mm01-west@ddc.nic.in', '1761325797', 'https://districtcourtdelhi.webex.com/meet/readermm1west', 0),
  ('West.pdf', '51', 'Tis Hazari', 'West', '', '', '', 'Ms. Shruti Saraswat', 'Ld. JMFC- 03', 'Ms. Sushma', '8826197115', 'mm03-west@ddc.nic.in', '1765795927', 'https://districtcourtdelhi.webex.com/meet/mm03west', 0),
  ('West.pdf', '52', 'Tis Hazari', 'West', '', '', '', 'Sh Ankit Karan Singh', 'Ld. JMFC- 08', 'Sh. Suresh Kumar', '9873903154', 'mm08-west@ddc.nic.in', '1767913625', 'https://districtcourtdelhi.webex.com/meet/kkjudicialofficer2020', 0),
  ('West.pdf', '53', 'Tis Hazari', 'West', '', '', '', 'Ms. Nandini Sharma', 'Ld. JMFC- 06', 'Sh. Lalit Singh', '7011262057', 'mm06-west@ddc.nic.in', '1769674589', 'https://districtcourtdelhi.webex.com/meet/court355thc', 0),
  ('West.pdf', '54', 'Tis Hazari', 'West', '', '', '', 'Ms Alka Singh', 'Ld. CCJ/AR', 'Sh. Rajiv verma', '9717480115', 'ccjarc-west@ddc.nic.in', '1768474851', 'https://districtcourtdelhi.webex.com/meet/readerccjarc474west', 0),
  ('West.pdf', '55', 'Tis Hazari', 'West', '', '', '', 'Ms. Shruti Sharma-II', 'Ld. JMFC Mahila Court 02', 'Ms Ritu Arora', '9899863266', 'readermm02west@gmail.com', '1767025603', 'https://districtcourtdelhi.webex.com/meet/readermm02west', 1),
  ('West.pdf', '56', 'Tis Hazari', 'West', '', '', '', 'Sh. Shashank Nandan Bhatt', 'Ld. JMFC 02', 'Sh. Mohan Singh', '8076254508', 'mm02-west@ddc.nic.in', '1768015351', 'https://districtcourtdelhi.webex.com/meet/judicialmm02west', 0),
  ('West.pdf', '57', 'Tis Hazari', 'West', '', '', '', 'Ms. Deepika Goyal Shokeen', 'Ld. JMFC, MAHILA COURT 03', 'Sh. Lalit Kishore', '9910455327', 'mahilacourt03-wt@ddc.nic.in', '1764623193', 'https://districtcourtdelhi.webex.com/meet/mmmahilacourt03west', 1),
  ('West.pdf', '58', 'Tis Hazari', 'West', '', '', '', 'Sh. Ankur Panghal', 'Ld. JMFC- 05', 'Sh. Mani Bhusha', '9910180533', 'mm05-west@ddc.nic.in', '1768058350', 'https://districtcourtdelhi.webex.com/meet/mm05west', 0),
  ('West.pdf', '59', 'Tis Hazari', 'West', '', '', '', 'Sh. Vikas Madaan', 'Ld. JMFC- 07', 'Ms. Kamla', '8920437168', 'mm07-west@ddc.nic.in', '1762438294', 'https://districtcourtdelhi.webex.com/meet/readermm07west', 0),
  ('West.pdf', '60', 'Tis Hazari', 'West', '', '', '', 'Sh. Gaurav Ujjwal', 'Ld. JMFC (NI ACT) 01', 'Sh. Krishan Gopal', '9899616444', 'mmniact01-west@ddc.nic.in', '1767613995', 'https://districtcourtdelhi.webex.com/meet/mmniact01west', 0),
  ('West.pdf', '61', 'Tis Hazari', 'West', '', '', '', 'Sh. Anshul Singhal', 'Ld. JMFC 04', 'Sh. Satish', '9818229184', 'mm04-west@ddc.nic.in', '1760162034', 'https://districtcourtdelhi.webex.com/meet/readermm04west', 0),
  ('West.pdf', '62', 'Tis Hazari', 'West', '', '', '', 'Ms. Jyoti Nain', 'Ld. JMFC Mahila court- 01', 'Sh. Aashish Gupta', '9811022813', 'mahilacourt01-wt@ddc.nic.in', '1768054441', 'https://districtcourtdelhi.webex.com/meet/readermahilacourt01west', 1),
  ('West.pdf', '63', 'Tis Hazari', 'West', '', '', '', 'Sh. Gaurav Singal', 'Ld. JMFC,NI ACT 04', 'Sh. Ashok Kumar Verma', '7011606319', 'mmniact04-west@ddc.nic.in', '1769058380', 'https://districtcourtdelhi.webex.com/meet/readermm05west', 0),
  ('West.pdf', '64', 'Tis Hazari', 'West', '', '', '', 'Sh. Lalit Kumar', 'Ld. CJ- 02', 'Sh. Raju Dubey', '9871888389', 'cj02-west@ddc.nic.in', '1764904801', 'https://districtcourtdelhi.webex.com/meet/readercj02west', 0),
  ('West.pdf', '65', 'Tis Hazari', 'West', '', '', '', 'Ms. Deshna Golechha', 'Ld. JMFC NI-ACT 02', 'Sh. Subhash chander', '9416934137', 'niact.03west@gmail.com', '1761880153', 'https://districtcourtdelhi.webex.com/meet/niact.03west', 0),
  ('West.pdf', '66', 'Tis Hazari', 'West', '', '', '', 'Ms. Shivangi Mangla', 'Ld. JMFC NI-ACT 05', 'Ms. Meenakshi', '9315952925', NULL, '1768815620', 'https://districtcourtdelhi.webex.com/meet/niwest0002', 0),
  ('West.pdf', '66', 'Tis Hazari', 'West', '', '', '', 'Sh. Sahil Monga', 'Ld. CJ- 03', 'Sh. Dilbar Singh Rawat', '8447842670', 'cj03-west@ddc.nic.in', '1766052050', 'https://districtcourtdelhi.webex.com/meet/ahlmadcj03', 0),
  ('West.pdf', '67', 'Tis Hazari', 'West', '', '', '', 'Ms. Helly Fur Kaur', 'Ld. CJ- 04', 'Sh. Jasvinder Sidhu', '9810569534', 'cj04-west@ddc.nic.in', '25148707643', 'https://districtcourtdelhi.webex.com/meet/cj04west', 0),
  ('West.pdf', '68', 'Tis Hazari', 'West', '', '', '', 'Sh Tanmay Batham', 'Ld. JMFC NI-ACT- 03', 'Sh. Rajender Singh', '8447470670', 'mmniact04-west@ddc.nic.in', '1760769501', 'https://districtcourtdelhi.webex.com/meet/readermmniact04west', 0),
  ('West.pdf', '69', 'Tis Hazari', 'West', '', '', '', 'Ms Ishita Bhardwaj', 'Ld. CJ- 01', 'Sh. Surender Bisht', '8130970065', 'readercj01-west@ddc.nic.in', '1760714845', 'https://districtcourtdelhi.webex.com/meet/readercj01west', 0),
  ('West.pdf', '70', 'Tis Hazari', 'West', '', '', '', 'Ms. Chhavi Bansal', 'Ld. JMFC MAHILA COURT -04', 'Ms. Mamta Kharotia', '8448361781', 'mahilacourt04-wt@ddc.nic.in', '1767062054', 'https://districtcourtdelhi.webex.com/meet/mmmahilacourt04west', 1),
  ('West.pdf', '71', 'Tis Hazari', 'West', '', '', '', 'Ms. Deeksha Madaan', 'Ld. JMFC MAHILA COURT- 05', 'Sh. Ravi Negi', '9868677909', 'mahilacourt05-wt@ddc.nic.in', '1763338125', 'https://districtcourtdelhi.webex.com/meet/readermm05mcwest', 1),
  ('West.pdf', '72', 'Tis Hazari', 'West', '', '', '', 'Ms Anamika', 'Ld. JMFC MAHILA COURT- 06', 'Sh. Rajesh', '9873193396', 'jmfcmahila06-wt@ddc.nic.in', '25159213454', 'https://districtcourtdelhi.webex.com/meet/jmfcmahila06-wt', 1),
  ('West.pdf', '73', 'Tis Hazari', 'West', '', '', '', 'Ms. Shraddha Srivastava', 'JMFC-09', 'Ms. Kaveri', '9315876336', 'jmfc09-west@ddc.nic.in', '25126471997', 'https://districtcourtdelhi.webex.com/meet/jmfc09-west', 0),
  ('West.pdf', '74', 'Tis Hazari', 'West', '', '', '', 'Ms. Sheetal Rani', 'JMFC-12', 'Sh. Parveen Kumar', '9350217319', 'jmfc12-wt@ddc.nic.in', '25182198565', 'https://districtcourtdelhi.webex.com/meet/jmfc09west', 0),
  ('West.pdf', '75', 'Tis Hazari', 'West', '', '', '', 'Ms. Renu', 'JMFC-10', 'Sh. Pankaj', '9811707580', 'jmfc10-west@ddc.nic.in', '25150266216', 'https://districtcourtdelhi.webex.com/meet/jmfc10west', 0),
  ('West.pdf', '76', 'Tis Hazari', 'West', '', '', '', 'Ms. Moksha Bains', 'JMFC-11', 'Ms. Anita', '7982454075', 'jmfc11-west@ddc.nic.in', '25159636362', 'https://districtcourtdelhi.webex.com/meet/jmfc11west', 0),
  ('West.pdf', '1', 'Tis Hazari', 'West', '', '', '', 'Ms. Atisha Jain', 'JMFC Digital Traffic Court', 'Sh. Ravi Kumar', '9810944169', 'dtc-west@ddc.nic.in', '25100754780', 'https://districtcourtdelhi.webex.com/meet/dtc-west', 0),
  ('New Delhi-District Patiala house court.pdf', '1', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Pitamber Dutt', 'Principal District & Sessions Judge', 'Sh. Vikas Kumar', '9868944946', 'pdsj-nd@ddc.nic.in', '1769016219', 'https://districtcourtdelhi.webex.com/meet/readerdjphc', 0),
  ('New Delhi-District Patiala house court.pdf', '2', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Anil Antil', 'Commercial Court-01', 'Mr. Dhanesh', '8826870619', 'djcomm01-nd@ddc.nic.in', '1768920796', 'https://districtcourtdelhi.webex.com/meet/readerdjcomm01', 0),
  ('New Delhi-District Patiala house court.pdf', '3', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Manoj Kumar-I', 'District Judge (Commercial Court)-02', 'Ms. Jyoti', '8076697561', 'djcomm02-nd@ddc.nic.in', '1763955568', 'https://districtcourtdelhi.webex.com/meet/readerdjcc02phc', 0),
  ('New Delhi-District Patiala house court.pdf', '4', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Deepali Sharma', 'District Judge (Commercial Court)-03', 'Sh. Ishwar Kumar', '9818193820', 'djcomm03-nd@ddc.nic.in', '1768503673', 'https://districtcourtdelhi.webex.com/meet/readerdjcc03phc', 0),
  ('New Delhi-District Patiala house court.pdf', '5', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Syed Zishan Ali Warsi', 'ASJ-02', 'Sh. Satish Kumar', '9654198424', 'asj04-nd@ddc.nic.in', '1763167351', 'https://districtcourtdelhi.webex.com/meet/readerasj04phc', 0),
  ('New Delhi-District Patiala house court.pdf', '6', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Saurabh Partap Singh Laler', 'ASJ-03', 'Sh. Santosh Kumar', '9213406071', 'asj05-nd@ddc.nic.in', '25148686956', 'https://districtcourtdelhi.webex.com/meet/readerasj5phc', 0),
  ('New Delhi-District Patiala house court.pdf', '7', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Gomati Manocha', 'ASJ-04', 'Sh. Nirmal Singh Negi', '9968076885', 'asj06-nd@ddc.nic.in', '25119896195', 'https://districtcourtdelhi.webex.com/meet/readerasj6phc', 0),
  ('New Delhi-District Patiala house court.pdf', '8', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Dhirender Rana', 'ASJ-05', 'Sh. Yogesh Kumar', '9911457860', 'asj07-nd@ddc.nic.in', '25131103248', 'https://districtcourtdelhi.webex.com/meet/readerasj7phc', 0),
  ('New Delhi-District Patiala house court.pdf', '9', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Deepti Devesh', 'ASJ (SFTC)', 'Sh. Navinder Kumar', '9868225982/8076601997', 'asjsftc-nd@ddc.nic.in', '1763666566', 'https://districtcourtdelhi.webex.com/meet/readerasjsftcphc', 0),
  ('New Delhi-District Patiala house court.pdf', '10', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Dharmender Rana', 'DJ-01', 'Sh. Shankar Singh', '7827320996', 'adj01-nd@ddc.nic.in', '1766298065', 'https://districtcourtdelhi.webex.com/meet/readeradj01phc', 0),
  ('New Delhi-District Patiala house court.pdf', '11', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Pankaj Sharma', 'DJ-02 & Wakf Tribunal', 'Sh. Prasenjit Sahai', '9555177489/7906002055', 'adj02wt-nd@ddc.nic.in', '1764060659', 'https://districtcourtdelhi.webex.com/meet/readeradj02phc', 0);

INSERT INTO tmp_court_roster (source_file, source_row, court, district, court_no, building, floor, judge_name, designation, court_reader_name, court_reader_phone, court_email, vc_meeting_id, virtual_court_link, mahila_court) VALUES
  ('New Delhi-District Patiala house court.pdf', '12', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Meenu Kaushik', 'DJ-03', 'Sh. Kamal', '9871549465/7982779841', 'adj03-nd@ddc.nic.in', '1762824413', 'https://districtcourtdelhi.webex.com/meet/readeradj03phc', 0),
  ('New Delhi-District Patiala house court.pdf', '13', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Aparna Swami', 'DJ-04', 'Sh. Lalit Kumar', '9818747344', 'adj04-nd@ddc.nic.in', '1769441204', 'https://districtcourtdelhi.webex.com/meet/readeradj4phc', 0),
  ('New Delhi-District Patiala house court.pdf', '14', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Sakshi Sejwal', 'District Judge-05', 'Ms. Beenu Shukla', '8826680109', 'dj05-nd@ddc.nic.in', '25173480762', 'https://districtcourtdelhi.webex.com/meet/dj05-nd', 0),
  ('New Delhi-District Patiala house court.pdf', '15', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Shankar Narayanan', 'ASJ (POSCO)-01', 'Sh. Ajay Saklani', '9868257018', 'asj01-nd@ddc.nic.in', '1768967559', 'https://districtcourtdelhi.webex.com/meet/readerasj01phc', 0),
  ('New Delhi-District Patiala house court.pdf', '16', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Prabh Deep Kaur', 'ASJ (POSCO)-06', 'Ms. Shalu', '9818034325', 'asjpocso02-nd@ddc.nic.in', '25172889692', 'https://districtcourtdelhi.webex.com/meet/asjpocso02nd', 0),
  ('New Delhi-District Patiala house court.pdf', '17', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Sonam Singh-I', 'ASJ (POSCO)-07', 'Sh. Kiran Pal', '9958335363', 'asjpocso03-nd@ddc.nic.in', '25127894516', 'https://districtcourtdelhi.webex.com/meet/asjpocso03nd', 0),
  ('New Delhi-District Patiala house court.pdf', '18', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Shirish Aggarwal', 'PO MACT-01', 'Ms. Manjeet Kaur', '9013324814', 'delhinewdelhi.mact@delhi.gov.in', '1767249254', 'https://districtcourtdelhi.webex.com/meet/readerpomactphc', 0),
  ('New Delhi-District Patiala house court.pdf', '19', 'Patiala House', 'New Delhi', '', '', '', 'Dr. Abhilash Malhotra', 'PO MACT-02', 'Sh. Parvinder Singh', '8851819127', 'pomact02-nd@ddc.nic.in', '25157406373', 'https://districtcourtdelhi.webex.com/meet/pomact02-nd', 0),
  ('New Delhi-District Patiala house court.pdf', '20', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Sandeep Yadav', 'Special Exclusive Court/Spl. Judge NDPS-07', 'Ms. Rajni Sharma', '9871523845', 'secsjndps07-nd@ddc.nic.in', '25194043878', 'https://districtcourtdelhi.webex.com/meet/secsjndps07-nd', 0),
  ('New Delhi-District Patiala house court.pdf', '21', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Devender Kumar Sharma', 'Special Exclusive Court/Spl. Judge NDPS-08', 'Ms. Manju Sharma', '9871450215', 'secsjndps08-nd@ddc.nic.in', '25199812710', 'https://districtcourtdelhi.webex.com/meet/secsjndps08-nd', 0),
  ('New Delhi-District Patiala house court.pdf', '22', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Anuradha Shukla', 'Special Exclusive Court/Spl. Judge NDPS-09', 'Sh. Ram Singh', '8168000982', 'secsjndps09-nd@ddc.nic.in', '25180900791', 'https://districtcourtdelhi.webex.com/meet/secsjndps09-nd', 0),
  ('New Delhi-District Patiala house court.pdf', '23', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Bhupinder Singh', 'Special Exclusive Court/Spl. Judge NDPS-10', 'Ms. Rajesh Kumar', '9968286340', 'secsjndps10-nd@ddc.nic.in', '25179485278', 'https://districtcourtdelhi.webex.com/meet/secsjndps10-nd', 0),
  ('New Delhi-District Patiala house court.pdf', '24', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Mridul Gupta', 'Chief Judicial Magistrate', 'Sh. Pramod Kumar Kaushik', '9873001315', 'cmm-nd@ddc.nic.in', '1763879326', 'https://districtcourtdelhi.webex.com/meet/readercmmphc', 0),
  ('New Delhi-District Patiala house court.pdf', '25', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Animesh Bhaskar Mani Tripathii', 'ACJM-01', 'Sh. Ganesh Chand Malasi', '9818132691', 'acmm01-nd@ddc.nic.in', '1762597180', 'https://districtcourtdelhi.webex.com/meet/readeracmm01phc', 0),
  ('New Delhi-District Patiala house court.pdf', '26', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Siddhant Sihag', 'ACJM-02', 'Sh. Rajesh Kumar', '9266327416', 'acmm02-nd@ddc.nic.in', '1760628216', 'https://districtcourtdelhi.webex.com/meet/readeracmm02phc', 0),
  ('New Delhi-District Patiala house court.pdf', '27', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Charan Salwan', 'JMFC-01', 'Sh. Sushil Sethi', '9910904274', 'mm01-nd@ddc.nic.in', '1767672306', 'https://districtcourtdelhi.webex.com/meet/readermm01phc', 0),
  ('New Delhi-District Patiala house court.pdf', '28', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Animesh Kumar', 'JMFC-02', 'Sh. Rajesh Saini', '9212528666', 'mm02-nd@ddc.nic.in', '1760094460', 'https://districtcourtdelhi.webex.com/meet/reeadermm02phc', 0),
  ('New Delhi-District Patiala house court.pdf', '29', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Aridaman Singh Cheema', 'JMFC-03', 'Md. Sultan', '9015324978', 'mm03-nd@ddc.nic.in', '1760568995', 'https://districtcourtdelhi.webex.com/meet/readersmm03phc', 0),
  ('New Delhi-District Patiala house court.pdf', '30', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Twinkle Chawla', 'JMFC-04', 'Sh. Dalip kumar', '9911433668', 'mm04-nd@ddc.nic.in', '1762755549', 'https://districtcourtdelhi.webex.com/meet/readermm04phc', 0),
  ('New Delhi-District Patiala house court.pdf', '31', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Vijayshree Rathore', 'JMFC-05', 'Ms. Madhu Arora', '9013325968', 'mm05-nd@ddc.nic.in', '1763532370', 'https://districtcourtdelhi.webex.com/meet/readermm05phc', 0),
  ('New Delhi-District Patiala house court.pdf', '32', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Kautuk Bhardwaj', 'Judicial Magistrate First Class-06', 'Sh. Narendra Singh Negi', '9810228753', 'mm06-nd@ddc.nic.in', '1763006225', 'https://districtcourtdelhi.webex.com/meet/readermm06phc', 0),
  ('New Delhi-District Patiala house court.pdf', '33', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Bhavaya Karhail', 'Judicial Magistrate First Class-07', 'Sh. Rakesh Kumar', '9968274028', 'mm07-nd@ddc.nic.in', '1763016705', 'https://districtcourtdelhi.webex.com/meet/readermm07phc', 0),
  ('New Delhi-District Patiala house court.pdf', '34', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Ankit Mittal', 'Judicial Magistrate First Class-08', 'Sh. Prem Pal', '9996322751', 'mm08-nd@ddc.nic.in', '25195215184', 'https://districtcourtdelhi.webex.com/meet/readermm8phc', 0),
  ('New Delhi-District Patiala house court.pdf', '35', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Kavita Bist', 'JMFC (Mahila Court)-01', 'Sh. Shashi Bhushan', '9015119090', 'mahilacourt01-nd@ddc.nic.in', '1762431207', 'https://districtcourtdelhi.webex.com/meet/mmmc1readerphcnd', 1),
  ('New Delhi-District Patiala house court.pdf', '36', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Tabassum Khan', 'JMFC (Mahila Court)-02', 'Ms. Ranjana Kumari', '9871182037', 'mahilacourt02-nd@ddc.nic.in', '1762771024', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.newdelhi10', 1),
  ('New Delhi-District Patiala house court.pdf', '37', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Snehil Sharma', 'JMFC (NI Act)-01', 'Ms. Nisha', '9899675761', 'mmniact01-nd@ddc.nic.in', '1760397734', 'https://districtcourtdelhi.webex.com/meet/readermmniact01phc', 0),
  ('New Delhi-District Patiala house court.pdf', '38', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Akanksha Singh', 'JMFC (NI Act)-02', 'Ms. Jyoti Gupta', '7011979878', 'mmniact02-nd@ddc.nic.in', '1762613505', 'https://districtcourtdelhi.webex.com/meet/readermmni02phc', 0),
  ('New Delhi-District Patiala house court.pdf', '39', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Anjali Singh', 'JMFC (NI Act)-03', 'Sh. Sunil Kumar', '9253211402', 'mmniact03-nd@ddc.nic.in', '1767922363', 'https://districtcourtdelhi.webex.com/meet/readermmni03phc', 0),
  ('New Delhi-District Patiala house court.pdf', '40', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Vanshika Mehta', 'JMFC (NI Act)-04', 'Sh. Rajender Kumar', '9899297366', 'mmniact04-nd@ddc.nic.in', '1760691948', 'https://districtcourtdelhi.webex.com/meet/readermm04niphc', 0),
  ('New Delhi-District Patiala house court.pdf', '41', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Siddhant Kumar', 'JMFC (NI Act)-05', 'Sh. Deepu', '9911840744', 'mmniact05-nd@ddc.nic.in', '1763140042', 'https://districtcourtdelhi.webex.com/meet/readermm05phcni', 0),
  ('New Delhi-District Patiala house court.pdf', '42', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Mayank Goel', 'SCJ-cum-RC', 'Sh. Manu Vasudev', '9821203462', 'scjrc-nd@ddc.nic.in', '1763491056', 'https://districtcourtdelhi.webex.com/meet/readerscjphc', 0),
  ('New Delhi-District Patiala house court.pdf', '43', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Medha Arya', 'JSCC-cum-ASCJ-cum-GJ', 'Ms. Neelam Singh', '9560204973', 'jsccascjgj-nd@ddc.nic.in', '1767212449', 'https://districtcourtdelhi.webex.com/meet/readerjsccascjgjphc', 0),
  ('New Delhi-District Patiala house court.pdf', '44', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Rupinder Singh Dhiman', 'ACJ-cum- CCJ-cum-ARC', 'Sh. Manish Kumar', '9911184585', 'acjccjarc-nd@ddc.nic.in', '1765858477', 'https://districtcourtdelhi.webex.com/meet/ddc.vc.newdelhi09', 0),
  ('New Delhi-District Patiala house court.pdf', '45', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Vaibhav Pratap Singh', 'Civil Judge-01', 'Sh. Sanjay Pal Singh', '9911468777', 'cj01-nd@ddc.nic.in', '1767682620', 'https://districtcourtdelhi.webex.com/meet/readercj01phc', 0),
  ('New Delhi-District Patiala house court.pdf', '46', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Isha Thakur-01', 'JMFC, Digital Traffic Court/Virtual Traffic Court-01', 'Ms. Seema Bhandari', '9717786319', 'dtc-nd@ddc.nic.in', '25232277257', 'https://districtcourtdelhi.webex.com/meet/dtc-nd', 0),
  ('New Delhi-District Patiala house court.pdf', '47', 'Patiala House', 'New Delhi', '', '', '', 'Ms. Nishi Jindal-02', 'JMFC, Digital Traffic Court- 02', 'Sh. Madan Lal', '9910919581', 'dtc02-nd@ddc.nic.in', '25180105286', 'https://districtcourtdelhi.webex.com/meet/dtc02-nd', 0),
  ('New Delhi-District Patiala house court.pdf', '48', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Bhupesh Kumar', 'Principal Judge Family Court', 'Sh. Neeraj', '9268065876', 'readerfamilycourtphc@gmail.com', '1847237915', 'https://districtcourtdelhi.webex.com/meet/pjfc.phc', 0),
  ('New Delhi-District Patiala house court.pdf', '49', 'Patiala House', 'New Delhi', '', '', '', 'Sh. Devender Kumar Garg', 'Judge Family Court', 'Sh. Bajrang Sharma', '8287145245', 'dfcphc02@gmail.com', '25167081528', 'https://districtcourtdelhi.webex.com/meet/dfcphc02', 0);

-- All changes below are transactional. Court and profile rows are inserted idempotently.
-- Flyway manages this migration transaction.

-- Add only physical court seats actually provided in the source. Existing parent court/district rows remain untouched.
INSERT IGNORE INTO courts (court, district, building, floor, court_no, high_court, mahila_court)
SELECT r.court, r.district, r.building, r.floor, r.court_no, 0, MAX(r.mahila_court)
FROM tmp_court_roster r
WHERE r.court_no <> ''
GROUP BY r.court, r.district, r.building, r.floor, r.court_no;

-- If a physical court seat already exists, mark it as a Mahila Court when any source listing identifies it that way.
UPDATE courts c
JOIN (
  SELECT court, district, building, floor, court_no, MAX(mahila_court) AS is_mahila
  FROM tmp_court_roster
  WHERE court_no <> ''
  GROUP BY court, district, building, floor, court_no
) r ON r.court = c.court AND r.district = c.district
   AND r.building = c.building AND r.floor = c.floor AND r.court_no = c.court_no
SET c.mahila_court = TRUE
WHERE r.is_mahila = TRUE;

-- Ensure judge profiles exist. `name_key` follows JudgeProfile.keyOf: lowercase and collapsed spaces.
INSERT INTO judge_profiles (name, name_key, active, vacant, created_at, updated_at)
SELECT q.judge_name,
       LOWER(TRIM(REGEXP_REPLACE(q.judge_name, '[[:space:]]+', ' '))),
       TRUE,
       (LOWER(TRIM(q.judge_name)) = 'vacant'),
       NOW(6), NOW(6)
FROM (SELECT DISTINCT judge_name FROM tmp_court_roster) q
WHERE NOT EXISTS (
  SELECT 1 FROM judge_profiles p
  WHERE p.name_key = LOWER(TRIM(REGEXP_REPLACE(q.judge_name, '[[:space:]]+', ' ')))
);

-- Re-enable profiles actually present in the supplied current rosters without touching unrelated profiles.
UPDATE judge_profiles p
JOIN (SELECT DISTINCT LOWER(TRIM(REGEXP_REPLACE(judge_name, '[[:space:]]+', ' '))) AS name_key
      FROM tmp_court_roster) r ON r.name_key = p.name_key
SET p.active = TRUE, p.updated_at = NOW(6);

-- For districts whose PDFs contain room numbers, archive current listings in-scope first.
-- Their historical rows and court-number history are preserved; no rows are deleted.
UPDATE judges j
SET j.active = FALSE,
    j.archived_at = COALESCE(j.archived_at, NOW(6)),
    j.updated_at = NOW(6)
WHERE j.active = TRUE AND (
     (j.court = 'Rohini' AND j.district = 'North')
  OR (j.court = 'Rohini' AND j.district = 'North West')
  OR (j.court = 'Karkardooma' AND j.district = 'North East')
  OR (j.court = 'Karkardooma' AND j.district = 'Shahdara')
  OR (j.court = 'Saket' AND j.district = 'South')
  OR (j.court = 'Saket' AND j.district = 'South East')
);

-- Reactivate/update exact judge + seat matches for those districts. A different judge at the same seat gets a new listing,
-- preserving the old listing/profile linkage for historical records.
UPDATE judges j
JOIN judge_profiles p ON p.id = j.profile_id
JOIN tmp_court_roster r
  ON p.name_key = LOWER(TRIM(REGEXP_REPLACE(r.judge_name, '[[:space:]]+', ' ')))
 AND j.court = r.court AND j.district = r.district
 AND COALESCE(j.court_room_no, '') = r.court_no
 AND COALESCE(j.building, '') = r.building
 AND COALESCE(j.floor, '') = r.floor
LEFT JOIN courts seat
  ON r.court_no <> '' AND seat.court = r.court AND seat.district = r.district
 AND seat.court_no = r.court_no AND seat.building = r.building AND seat.floor = r.floor
LEFT JOIN courts parent
  ON parent.court = r.court AND parent.district = r.district
 AND parent.building = '' AND parent.floor = '' AND parent.court_no = ''
SET j.court_id = COALESCE(seat.id, parent.id, j.court_id),
    j.designation = COALESCE(NULLIF(r.designation, ''), j.designation),
    j.vc_meeting_id = COALESCE(NULLIF(r.vc_meeting_id, ''), j.vc_meeting_id),
    j.court_email = COALESCE(NULLIF(r.court_email, ''), j.court_email),
    j.virtual_court_link = COALESCE(NULLIF(r.virtual_court_link, ''), j.virtual_court_link),
    j.court_reader_name = COALESCE(NULLIF(r.court_reader_name, ''), j.court_reader_name),
    j.court_reader_phone = COALESCE(NULLIF(r.court_reader_phone, ''), j.court_reader_phone),
    j.active = TRUE,
    j.archived_at = NULL,
    j.updated_at = NOW(6)
WHERE r.district IN ('North', 'North West', 'North East', 'Shahdara', 'South', 'South East')
  AND r.court_no <> '';

-- Insert any roster entries with a stated room/seat that are not already active as the same judge at that seat.
INSERT INTO judges (
  profile_id, court, district, court_id, designation, court_room_no, building, floor,
  vc_meeting_id, court_email, virtual_court_link, court_reader_name, court_reader_phone,
  active, archived_at, created_at, updated_at
)
SELECT p.id, r.court, r.district, COALESCE(seat.id, parent.id), NULLIF(r.designation, ''),
       NULLIF(r.court_no, ''), NULLIF(r.building, ''), NULLIF(r.floor, ''),
       NULLIF(r.vc_meeting_id, ''), NULLIF(r.court_email, ''), NULLIF(r.virtual_court_link, ''),
       NULLIF(r.court_reader_name, ''), NULLIF(r.court_reader_phone, ''),
       TRUE, NULL, NOW(6), NOW(6)
FROM tmp_court_roster r
JOIN judge_profiles p
  ON p.name_key = LOWER(TRIM(REGEXP_REPLACE(r.judge_name, '[[:space:]]+', ' ')))
JOIN (SELECT name_key, MIN(id) AS id FROM judge_profiles GROUP BY name_key) canonical_profile
  ON canonical_profile.name_key = p.name_key AND canonical_profile.id = p.id
LEFT JOIN courts seat
  ON r.court_no <> '' AND seat.court = r.court AND seat.district = r.district
 AND seat.court_no = r.court_no AND seat.building = r.building AND seat.floor = r.floor
LEFT JOIN courts parent
  ON parent.court = r.court AND parent.district = r.district
 AND parent.building = '' AND parent.floor = '' AND parent.court_no = ''
WHERE r.district IN ('North', 'North West', 'North East', 'Shahdara', 'South', 'South East')
  AND r.court_no <> ''
  AND NOT EXISTS (
    SELECT 1 FROM judges j2
    JOIN judge_profiles p2 ON p2.id = j2.profile_id
    WHERE j2.active = TRUE AND p2.name_key = p.name_key
      AND j2.court = r.court AND j2.district = r.district
      AND COALESCE(j2.court_room_no, '') = r.court_no
      AND COALESCE(j2.building, '') = r.building
      AND COALESCE(j2.floor, '') = r.floor
  );

-- West/Tis Hazari and New Delhi/Patiala House source PDFs give judge/contact listings but no room/building/floor.
-- Update an existing active listing for the same judge in that district while preserving any location already recorded.
UPDATE judges j
JOIN judge_profiles p ON p.id = j.profile_id
JOIN tmp_court_roster r
  ON p.name_key = LOWER(TRIM(REGEXP_REPLACE(r.judge_name, '[[:space:]]+', ' ')))
 AND j.court = r.court AND j.district = r.district
LEFT JOIN courts parent
  ON parent.court = r.court AND parent.district = r.district
 AND parent.building = '' AND parent.floor = '' AND parent.court_no = ''
SET j.court_id = COALESCE(j.court_id, parent.id),
    j.designation = COALESCE(NULLIF(r.designation, ''), j.designation),
    j.vc_meeting_id = COALESCE(NULLIF(r.vc_meeting_id, ''), j.vc_meeting_id),
    j.court_email = COALESCE(NULLIF(r.court_email, ''), j.court_email),
    j.virtual_court_link = COALESCE(NULLIF(r.virtual_court_link, ''), j.virtual_court_link),
    j.court_reader_name = COALESCE(NULLIF(r.court_reader_name, ''), j.court_reader_name),
    j.court_reader_phone = COALESCE(NULLIF(r.court_reader_phone, ''), j.court_reader_phone),
    j.active = TRUE,
    j.archived_at = NULL,
    j.updated_at = NOW(6)
WHERE j.active = TRUE
  AND r.court_no = ''
  AND ((r.court = 'Tis Hazari' AND r.district = 'West')
    OR (r.court = 'Patiala House' AND r.district = 'New Delhi'));

-- Archive old West/Patiala House listings whose judge is no longer present in the supplied roster.
UPDATE judges j
JOIN judge_profiles p ON p.id = j.profile_id
SET j.active = FALSE,
    j.archived_at = COALESCE(j.archived_at, NOW(6)),
    j.updated_at = NOW(6)
WHERE j.active = TRUE AND (
     (j.court = 'Tis Hazari' AND j.district = 'West')
  OR (j.court = 'Patiala House' AND j.district = 'New Delhi')
) AND NOT EXISTS (
  SELECT 1 FROM tmp_court_roster r
  WHERE r.court = j.court AND r.district = j.district
    AND LOWER(TRIM(REGEXP_REPLACE(r.judge_name, '[[:space:]]+', ' '))) = p.name_key
);

-- Insert unmatched West/Patiala House roster names as parent-level listings; no location is inferred.
INSERT INTO judges (
  profile_id, court, district, court_id, designation, court_room_no, building, floor,
  vc_meeting_id, court_email, virtual_court_link, court_reader_name, court_reader_phone,
  active, archived_at, created_at, updated_at
)
SELECT p.id, r.court, r.district, parent.id, NULLIF(r.designation, ''),
       NULLIF(r.court_no, ''), NULLIF(r.building, ''), NULLIF(r.floor, ''),
       NULLIF(r.vc_meeting_id, ''), NULLIF(r.court_email, ''), NULLIF(r.virtual_court_link, ''),
       NULLIF(r.court_reader_name, ''), NULLIF(r.court_reader_phone, ''),
       TRUE, NULL, NOW(6), NOW(6)
FROM tmp_court_roster r
JOIN judge_profiles p
  ON p.name_key = LOWER(TRIM(REGEXP_REPLACE(r.judge_name, '[[:space:]]+', ' ')))
JOIN (SELECT name_key, MIN(id) AS id FROM judge_profiles GROUP BY name_key) canonical_profile
  ON canonical_profile.name_key = p.name_key AND canonical_profile.id = p.id
LEFT JOIN courts parent
  ON parent.court = r.court AND parent.district = r.district
 AND parent.building = '' AND parent.floor = '' AND parent.court_no = ''
WHERE r.court_no = ''
  AND ((r.court = 'Tis Hazari' AND r.district = 'West')
    OR (r.court = 'Patiala House' AND r.district = 'New Delhi'))
  AND NOT EXISTS (
    SELECT 1 FROM judges j2
    JOIN judge_profiles p2 ON p2.id = j2.profile_id
    WHERE j2.active = TRUE AND p2.name_key = p.name_key
      AND j2.court = r.court AND j2.district = r.district
  );

DROP TEMPORARY TABLE IF EXISTS tmp_court_roster;
