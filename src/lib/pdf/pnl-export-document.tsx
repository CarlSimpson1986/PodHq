import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatGBP, formatMonthLabel, formatDate } from "@/lib/format";
import type { GymName } from "@/lib/data/types";
import type { MonthRange } from "@/lib/data/revenue";
import type { PnlFigures, OutgoingTransaction } from "@/lib/data/outgoings";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", color: "#111111" },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 12, color: "#444444", marginBottom: 2 },
  generatedAt: { fontSize: 9, color: "#777777", marginBottom: 20 },
  summaryRow: { flexDirection: "row", marginBottom: 24 },
  summaryTile: { flex: 1, borderWidth: 1, borderColor: "#dddddd", padding: 10, marginRight: 8 },
  summaryLabel: { fontSize: 9, color: "#666666", marginBottom: 4 },
  summaryValue: { fontSize: 13, fontWeight: 700 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 20, marginBottom: 8 },
  sectionNote: { fontSize: 9, color: "#777777", marginBottom: 10 },
  table: { borderWidth: 1, borderColor: "#dddddd" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eeeeee" },
  tableRowLast: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#111111" },
  cellCategory: { flex: 1, padding: 6 },
  cellAmount: { width: 100, padding: 6, textAlign: "right" },
  totalLabel: { flex: 1, padding: 6, fontWeight: 700 },
  totalAmount: { width: 100, padding: 6, textAlign: "right", fontWeight: 700 },
  categoryGroupTitle: { fontSize: 10, fontWeight: 700, marginTop: 14, marginBottom: 4 },
  txnTable: { borderWidth: 1, borderColor: "#eeeeee" },
  txnRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f3f3f3" },
  txnDate: { width: 70, padding: 5, fontSize: 9 },
  txnDescription: { flex: 1, padding: 5, fontSize: 9 },
  txnAmount: { width: 80, padding: 5, fontSize: 9, textAlign: "right" },
});

function formatRange(range: MonthRange): string {
  return range.start === range.end
    ? formatMonthLabel(range.start)
    : `${formatMonthLabel(range.start)} – ${formatMonthLabel(range.end)}`;
}

interface PnlExportDocumentProps {
  gym: GymName;
  range: MonthRange;
  rangeLabel: string;
  figures: PnlFigures;
  transactions: OutgoingTransaction[];
  generatedAt: string;
}

export function PnlExportDocument({ gym, range, rangeLabel, figures, transactions, generatedAt }: PnlExportDocumentProps) {
  const transactionsByCategory = new Map<string, OutgoingTransaction[]>();
  for (const txn of transactions) {
    const group = transactionsByCategory.get(txn.category) ?? [];
    group.push(txn);
    transactionsByCategory.set(txn.category, group);
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>PodHQ — P&amp;L Report</Text>
        <Text style={styles.subtitle}>
          {gym} — {rangeLabel} ({formatRange(range)})
        </Text>
        <Text style={styles.generatedAt}>Generated on {generatedAt}</Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Revenue</Text>
            <Text style={styles.summaryValue}>{formatGBP(figures.revenue)}</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Other income</Text>
            <Text style={styles.summaryValue}>{formatGBP(figures.otherIncome)}</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Outgoings</Text>
            <Text style={styles.summaryValue}>{formatGBP(figures.outgoings)}</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Ad spend</Text>
            <Text style={styles.summaryValue}>{formatGBP(figures.adSpend)}</Text>
          </View>
          <View style={{ ...styles.summaryTile, marginRight: 0 }}>
            <Text style={styles.summaryLabel}>Net P&amp;L</Text>
            <Text style={styles.summaryValue}>{formatGBP(figures.net)}</Text>
          </View>
        </View>

        {figures.otherIncome > 0 && (
          <>
            <Text style={styles.sectionTitle}>Other income by category</Text>
            <View style={styles.table}>
              {figures.otherIncomeBreakdown
                .filter((row) => row.amountGbp > 0)
                .map((row) => (
                  <View style={styles.tableRow} key={row.category}>
                    <Text style={styles.cellCategory}>{row.category}</Text>
                    <Text style={styles.cellAmount}>{formatGBP(row.amountGbp)}</Text>
                  </View>
                ))}
              <View style={styles.tableRowLast}>
                <Text style={styles.totalLabel}>Total other income</Text>
                <Text style={styles.totalAmount}>{formatGBP(figures.otherIncome)}</Text>
              </View>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Outgoings by category</Text>
        <View style={styles.table}>
          {figures.categoryBreakdown.map((row) => (
            <View style={styles.tableRow} key={row.category}>
              <Text style={styles.cellCategory}>{row.category}</Text>
              <Text style={styles.cellAmount}>{formatGBP(row.amountGbp)}</Text>
            </View>
          ))}
          <View style={styles.tableRowLast}>
            <Text style={styles.totalLabel}>Total outgoings</Text>
            <Text style={styles.totalAmount}>{formatGBP(figures.outgoings)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Transaction detail</Text>
        <Text style={styles.sectionNote}>
          Itemised transactions are only available for categories entered via bank-statement import — a category
          above with no transactions listed here was entered as a monthly total instead.
        </Text>
        {transactions.length === 0 ? (
          <Text style={{ fontSize: 10, color: "#666666" }}>No itemised transactions for this period.</Text>
        ) : (
          [...transactionsByCategory.entries()].map(([category, txns]) => (
            <View key={category}>
              <Text style={styles.categoryGroupTitle}>
                {category} ({formatGBP(txns.reduce((sum, t) => sum + t.amountGbp, 0))})
              </Text>
              <View style={styles.txnTable}>
                {txns.map((txn) => (
                  <View style={styles.txnRow} key={txn.id}>
                    <Text style={styles.txnDate}>{formatDate(txn.date)}</Text>
                    <Text style={styles.txnDescription}>{txn.description}</Text>
                    <Text style={styles.txnAmount}>{formatGBP(txn.amountGbp)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </Page>
    </Document>
  );
}
