# Migration Guide: xlsx to ExcelJS

Due to security vulnerabilities in the `xlsx` package (ReDoS and Prototype Pollution), we have migrated to `exceljs` - a modern, actively maintained alternative with no known vulnerabilities.

## Why ExcelJS?

- ✅ **No security vulnerabilities**
- ✅ **Actively maintained** (regular updates)
- ✅ **Better performance**
- ✅ **Modern async/await API**
- ✅ **More features** (styling, formulas, data validation)
- ✅ **Better TypeScript support**

## Installation

Already done! ExcelJS is now in `package.json`:
```json
"exceljs": "^4.4.0"
```

## API Differences

### Reading Files

**Old (xlsx):**
```javascript
const XLSX = require('xlsx');
const workbook = XLSX.readFile('file.xlsx');
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(worksheet);
```

**New (exceljs):**
```javascript
const ExcelJS = require('exceljs');
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('file.xlsx');
const worksheet = workbook.worksheets[0]; // or workbook.getWorksheet(1)
const data = [];
worksheet.eachRow((row, rowNumber) => {
    data.push(row.values);
});
```

### Writing Files

**Old (xlsx):**
```javascript
const XLSX = require('xlsx');
const worksheet = XLSX.utils.json_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
XLSX.writeFile(workbook, 'output.xlsx');
```

**New (exceljs):**
```javascript
const ExcelJS = require('exceljs');
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Sheet1');

// Add headers
worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Name', key: 'name', width: 32 }
];

// Add rows
worksheet.addRows(data);

await workbook.xlsx.writeFile('output.xlsx');
```

### Reading from Buffer (for file uploads)

**Old (xlsx):**
```javascript
const XLSX = require('xlsx');
const workbook = XLSX.read(buffer, { type: 'buffer' });
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(worksheet);
```

**New (exceljs):**
```javascript
const ExcelJS = require('exceljs');
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(buffer);
const worksheet = workbook.worksheets[0];
const data = [];
worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > 1) { // Skip header row
        data.push({
            // Map cell values to object properties
            id: row.getCell(1).value,
            name: row.getCell(2).value
        });
    }
});
```

### Writing to Buffer (for HTTP response)

**Old (xlsx):**
```javascript
const XLSX = require('xlsx');
const worksheet = XLSX.utils.json_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
res.setHeader('Content-Disposition', 'attachment; filename=data.xlsx');
res.send(buffer);
```

**New (exceljs):**
```javascript
const ExcelJS = require('exceljs');
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Sheet1');

worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Name', key: 'name', width: 32 }
];
worksheet.addRows(data);

res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
res.setHeader('Content-Disposition', 'attachment; filename=data.xlsx');
await workbook.xlsx.write(res);
```

## Common Use Cases in ZEDLY

### 1. Importing Users from Excel

**Before:**
```javascript
router.post('/import', upload.single('file'), async (req, res) => {
    const XLSX = require('xlsx');
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const users = XLSX.utils.sheet_to_json(worksheet);
    
    // Process users...
});
```

**After:**
```javascript
router.post('/import', upload.single('file'), async (req, res) => {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];
    
    const users = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 1) { // Skip header
            users.push({
                username: row.getCell(1).value,
                email: row.getCell(2).value,
                role: row.getCell(3).value
            });
        }
    });
    
    // Process users...
});
```

### 2. Exporting Test Results to Excel

**Before:**
```javascript
router.get('/export/:testId', async (req, res) => {
    const XLSX = require('xlsx');
    const results = await db.query('SELECT * FROM test_results WHERE test_id = $1', [req.params.testId]);
    
    const worksheet = XLSX.utils.json_to_sheet(results.rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});
```

**After:**
```javascript
router.get('/export/:testId', async (req, res) => {
    const ExcelJS = require('exceljs');
    const results = await db.query('SELECT * FROM test_results WHERE test_id = $1', [req.params.testId]);
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Results');
    
    // Define columns
    worksheet.columns = [
        { header: 'Student', key: 'student_name', width: 30 },
        { header: 'Score', key: 'score', width: 10 },
        { header: 'Date', key: 'created_at', width: 20 }
    ];
    
    // Add data
    worksheet.addRows(results.rows);
    
    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1b3b6f' }
    };
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=test-results.xlsx');
    await workbook.xlsx.write(res);
});
```

## Advanced Features (Not available in xlsx)

### Adding Styles

```javascript
// Style a cell
worksheet.getCell('A1').font = {
    name: 'Arial',
    size: 12,
    bold: true,
    color: { argb: 'FFFFFFFF' }
};

worksheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1b3b6f' }
};

// Style a row
worksheet.getRow(1).height = 20;
worksheet.getRow(1).font = { bold: true };
```

### Adding Formulas

```javascript
worksheet.getCell('D2').value = { formula: 'A2+B2+C2' };
worksheet.getCell('E10').value = { formula: 'SUM(E2:E9)' };
```

### Data Validation

```javascript
worksheet.getCell('B2').dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: ['"Teacher,Student,Admin"']
};
```

### Conditional Formatting

```javascript
worksheet.addConditionalFormatting({
    ref: 'B2:B10',
    rules: [
        {
            type: 'cellIs',
            operator: 'greaterThan',
            formulae: [80],
            style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF10B981' } } }
        }
    ]
});
```

## Finding xlsx Usage in Code

To find all places where xlsx is used:

```bash
# Search for xlsx imports
grep -r "require('xlsx')" backend/
grep -r "from 'xlsx'" backend/

# Search for XLSX usage
grep -r "XLSX\." backend/
```

## Testing Checklist

After migrating:

- [ ] Test file upload functionality
- [ ] Test file download/export functionality
- [ ] Verify Excel file format compatibility
- [ ] Test with large files (performance)
- [ ] Test error handling for corrupted files
- [ ] Verify all data is correctly imported/exported
- [ ] Test column headers are preserved
- [ ] Check that formulas work (if used)

## Breaking Changes

1. **Async/Await Required**: ExcelJS uses async operations, so you'll need to use `await` or `.then()`
2. **Different API**: Method names and structure are different
3. **Row/Column Indexing**: ExcelJS uses 1-based indexing (row 1 = first row), xlsx uses 0-based

## Need Help?

- **ExcelJS Documentation**: https://github.com/exceljs/exceljs
- **Examples**: https://github.com/exceljs/exceljs#interface
- **API Reference**: https://github.com/exceljs/exceljs/blob/master/README.md

## Support

If you encounter any issues during migration, please:
1. Check the ExcelJS documentation
2. Review the examples in this guide
3. Ask in the team chat or create an issue

---

**Note**: This migration is necessary for security reasons. The xlsx package has known vulnerabilities that have no patches available.
