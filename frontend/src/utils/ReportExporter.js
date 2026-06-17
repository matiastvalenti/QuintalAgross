import * as XLSX from 'xlsx';

/**
 * Exports data to an Excel file (.xlsx)
 * @param {Array} data - Array of objects to export
 * @param {string} fileName - Base name of the file
 * @param {string} sheetName - Name of the worksheet
 */
export const exportToExcel = (data, fileName = 'reporte', sheetName = 'Datos') => {
    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        
        // Auto-calculate column widths
        const objectMaxLength = []; 
        data.forEach((row) => {
          Object.keys(row).forEach((key, index) => {
            const value = (row[key] !== null && row[key] !== undefined) ? String(row[key]) : "";
            const keyLength = String(key).length;
            const valueLength = value.length;
            objectMaxLength[index] = Math.max(objectMaxLength[index] || 0, keyLength, valueLength);
          });
        });

        // Use 'wch' for character width in SheetJS
        ws['!cols'] = objectMaxLength.map(w => ({ wch: w + 2 }));

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        
        const finalName = `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, finalName);
        return true;
    } catch (e) {
        console.error('Error exporting to Excel:', e);
        return false;
    }
};
