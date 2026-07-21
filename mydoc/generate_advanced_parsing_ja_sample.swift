import AppKit
import CoreGraphics

let repositoryRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let outputURL = repositoryRoot
    .appendingPathComponent("packages/cdk/rag-docs/docs")
    .appendingPathComponent("genu-advanced-parsing-ja-sample.pdf")

var mediaBox = CGRect(x: 0, y: 0, width: 595, height: 842)
guard let consumer = CGDataConsumer(url: outputURL as CFURL),
      let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
    fatalError("PDFコンテキストを作成できませんでした")
}

let navy = NSColor(calibratedRed: 0.08, green: 0.18, blue: 0.31, alpha: 1)
let blue = NSColor(calibratedRed: 0.10, green: 0.42, blue: 0.68, alpha: 1)
let paleBlue = NSColor(calibratedRed: 0.90, green: 0.95, blue: 0.99, alpha: 1)
let paleGray = NSColor(calibratedWhite: 0.95, alpha: 1)
let darkGray = NSColor(calibratedWhite: 0.25, alpha: 1)

func withGraphicsContext(_ body: () -> Void) {
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
    body()
    NSGraphicsContext.restoreGraphicsState()
}

func fillRect(_ rect: CGRect, color: NSColor) {
    context.setFillColor(color.cgColor)
    context.fill(rect)
}

func strokeRect(_ rect: CGRect, color: NSColor = darkGray, width: CGFloat = 0.8) {
    context.setStrokeColor(color.cgColor)
    context.setLineWidth(width)
    context.stroke(rect)
}

func drawText(
    _ text: String,
    in rect: CGRect,
    size: CGFloat = 10,
    bold: Bool = false,
    color: NSColor = .black,
    alignment: NSTextAlignment = .left
) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = alignment
    paragraph.lineBreakMode = .byWordWrapping
    let attributes: [NSAttributedString.Key: Any] = [
        .font: bold ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size),
        .foregroundColor: color,
        .paragraphStyle: paragraph,
    ]
    withGraphicsContext {
        (text as NSString).draw(
            with: rect,
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attributes
        )
    }
}

func drawCell(
    _ text: String,
    rect: CGRect,
    fill: NSColor = .white,
    size: CGFloat = 9,
    bold: Bool = false,
    alignment: NSTextAlignment = .center,
    textColor: NSColor = .black
) {
    fillRect(rect, color: fill)
    strokeRect(rect)
    drawText(
        text,
        in: rect.insetBy(dx: 4, dy: 5),
        size: size,
        bold: bold,
        color: textColor,
        alignment: alignment
    )
}

func beginPage(section: String) {
    context.beginPDFPage(nil)
    fillRect(CGRect(x: 0, y: 812, width: 595, height: 30), color: navy)
    drawText(
        "架空資料｜GenU 高度解析評価用",
        in: CGRect(x: 35, y: 818, width: 350, height: 16),
        size: 10,
        bold: true,
        color: .white
    )
    drawText(
        section,
        in: CGRect(x: 390, y: 818, width: 165, height: 16),
        size: 9,
        color: .white,
        alignment: .right
    )
}

func endPage(_ page: Int) {
    drawText(
        "社外秘（評価用の架空データ）",
        in: CGRect(x: 35, y: 18, width: 250, height: 14),
        size: 8,
        color: .gray
    )
    drawText(
        "\(page) / 3",
        in: CGRect(x: 470, y: 18, width: 85, height: 14),
        size: 8,
        color: .gray,
        alignment: .right
    )
    context.endPDFPage()
}

// 1ページ目: 本文と複数階層ヘッダーを持つ表
beginPage(section: "01 エグゼクティブサマリー")
drawText(
    "2026年度 第2四半期\n地域別 事業継続・設備運用報告書",
    in: CGRect(x: 42, y: 728, width: 510, height: 70),
    size: 23,
    bold: true,
    color: navy
)
drawText(
    "対象期間：2026年4月1日〜6月30日　　作成部門：デジタル基盤統括部",
    in: CGRect(x: 44, y: 700, width: 500, height: 20),
    size: 10,
    color: darkGray
)
fillRect(CGRect(x: 42, y: 625, width: 510, height: 60), color: paleBlue)
drawText("要約", in: CGRect(x: 55, y: 657, width: 45, height: 18), size: 12, bold: true, color: blue)
drawText(
    "全地域の総合稼働率は99.95%で、重大インシデントは前四半期の5件から3件へ減少した。\n一方、東京第2拠点では冷却設備の局所的な温度上昇が確認され、7月中の対策完了を優先する。",
    in: CGRect(x: 105, y: 635, width: 430, height: 40),
    size: 10
)

drawText("表1　地域別サービス品質・設備指標", in: CGRect(x: 42, y: 593, width: 510, height: 20), size: 13, bold: true)
let tableX: CGFloat = 42
let tableTop: CGFloat = 575
let widths: [CGFloat] = [68, 67, 67, 55, 55, 77, 77]
let headerHeight: CGFloat = 28
let rowHeight: CGFloat = 42

drawCell("地域", rect: CGRect(x: tableX, y: tableTop - headerHeight * 2, width: widths[0], height: headerHeight * 2), fill: navy, size: 10, bold: true, textColor: .white)
drawCell("サービス品質", rect: CGRect(x: tableX + widths[0], y: tableTop - headerHeight, width: widths[1] + widths[2], height: headerHeight), fill: navy, size: 10, bold: true, textColor: .white)
drawCell("インシデント", rect: CGRect(x: tableX + widths[0] + widths[1] + widths[2], y: tableTop - headerHeight, width: widths[3] + widths[4], height: headerHeight), fill: navy, size: 10, bold: true, textColor: .white)
drawCell("エネルギー効率", rect: CGRect(x: tableX + widths[0] + widths[1] + widths[2] + widths[3] + widths[4], y: tableTop - headerHeight, width: widths[5] + widths[6], height: headerHeight), fill: navy, size: 10, bold: true, textColor: .white)

let secondHeaders = ["稼働率", "平均応答\n時間", "重大", "軽微", "消費電力量", "再エネ比率"]
var headerX = tableX + widths[0]
for index in 0..<secondHeaders.count {
    drawCell(secondHeaders[index], rect: CGRect(x: headerX, y: tableTop - headerHeight * 2, width: widths[index + 1], height: headerHeight), fill: NSColor(calibratedWhite: 0.82, alpha: 1), size: 8.5, bold: true)
    headerX += widths[index + 1]
}

let regionRows = [
    ["東京", "99.97%", "118 ms", "1件", "7件", "128 MWh", "42%"],
    ["大阪", "99.94%", "132 ms", "0件", "5件", "96 MWh", "55%"],
    ["福岡", "99.91%", "149 ms", "2件", "4件", "61 MWh", "68%"],
    ["全地域\n加重平均", "99.95%", "127 ms", "3件", "16件", "285 MWh", "51%"],
]
for (rowIndex, row) in regionRows.enumerated() {
    var x = tableX
    let y = tableTop - headerHeight * 2 - CGFloat(rowIndex + 1) * rowHeight
    for (columnIndex, value) in row.enumerated() {
        let isTotal = rowIndex == regionRows.count - 1
        drawCell(
            value,
            rect: CGRect(x: x, y: y, width: widths[columnIndex], height: rowHeight),
            fill: isTotal ? paleBlue : (rowIndex % 2 == 0 ? .white : paleGray),
            size: 9,
            bold: isTotal || columnIndex == 0
        )
        x += widths[columnIndex]
    }
}

drawText("注記", in: CGRect(x: 45, y: 310, width: 45, height: 18), size: 10, bold: true, color: blue)
drawText(
    "1. 稼働率は計画停止を除外して算出。2. 平均応答時間はAPIのP95値。3. 再エネ比率には非化石証書を含む。",
    in: CGRect(x: 88, y: 304, width: 450, height: 30),
    size: 9
)
drawText("主要な意思決定", in: CGRect(x: 42, y: 266, width: 180, height: 20), size: 13, bold: true)
let decisions = [
    "東京第2拠点の冷却風量の再調整を7月18日までに完了する。",
    "福岡拠点の重大インシデント2件について、電源切替手順と夜間連絡網を再訓練する。",
    "全地域の再エネ比率を2026年度末までに60%以上へ引き上げる。",
]
for (index, decision) in decisions.enumerated() {
    fillRect(CGRect(x: 48, y: 224 - CGFloat(index) * 45, width: 24, height: 24), color: blue)
    drawText("\(index + 1)", in: CGRect(x: 48, y: 229 - CGFloat(index) * 45, width: 24, height: 14), size: 10, bold: true, color: .white, alignment: .center)
    drawText(decision, in: CGRect(x: 82, y: 218 - CGFloat(index) * 45, width: 455, height: 34), size: 10)
}
endPage(1)

// 2ページ目: 結合行・複数期の計画実績を持つ表
beginPage(section: "02 改善施策ポートフォリオ")
drawText("改善施策ポートフォリオ", in: CGRect(x: 42, y: 755, width: 500, height: 35), size: 22, bold: true, color: navy)
drawText(
    "優先度は事業影響、復旧時間、法令・監査要件の3軸で評価した。金額は税抜、進捗率は6月30日時点。",
    in: CGRect(x: 44, y: 720, width: 505, height: 28),
    size: 10
)

let pX: CGFloat = 35
let pTop: CGFloat = 690
let pWidths: [CGFloat] = [58, 132, 56, 50, 50, 68, 72, 55]
let pHeader: CGFloat = 27
drawCell("分類", rect: CGRect(x: pX, y: pTop - pHeader * 2, width: pWidths[0], height: pHeader * 2), fill: navy, size: 9, bold: true, textColor: .white)
drawCell("施策", rect: CGRect(x: pX + pWidths[0], y: pTop - pHeader * 2, width: pWidths[1], height: pHeader * 2), fill: navy, size: 9, bold: true, textColor: .white)
drawCell("責任者", rect: CGRect(x: pX + pWidths[0] + pWidths[1], y: pTop - pHeader * 2, width: pWidths[2], height: pHeader * 2), fill: navy, size: 9, bold: true, textColor: .white)
let q2X = pX + pWidths[0] + pWidths[1] + pWidths[2]
drawCell("2026 Q2", rect: CGRect(x: q2X, y: pTop - pHeader, width: pWidths[3] + pWidths[4], height: pHeader), fill: navy, size: 9, bold: true, textColor: .white)
let q3X = q2X + pWidths[3] + pWidths[4]
drawCell("2026 Q3", rect: CGRect(x: q3X, y: pTop - pHeader, width: pWidths[5] + pWidths[6], height: pHeader), fill: navy, size: 9, bold: true, textColor: .white)
drawCell("状態", rect: CGRect(x: q3X + pWidths[5] + pWidths[6], y: pTop - pHeader * 2, width: pWidths[7], height: pHeader * 2), fill: navy, size: 9, bold: true, textColor: .white)
let subHeaders = ["計画", "実績", "目標", "期限"]
var subX = q2X
for (index, value) in subHeaders.enumerated() {
    let width = pWidths[index + 3]
    drawCell(value, rect: CGRect(x: subX, y: pTop - pHeader * 2, width: width, height: pHeader), fill: NSColor(calibratedWhite: 0.82, alpha: 1), size: 8.5, bold: true)
    subX += width
}

struct PortfolioRow {
    let category: String
    let categorySpan: Int
    let initiative: String
    let owner: String
    let plan: String
    let actual: String
    let target: String
    let deadline: String
    let status: String
}
let portfolioRows = [
    PortfolioRow(category: "設備", categorySpan: 2, initiative: "東京第2拠点\n冷却風量の再調整", owner: "佐藤", plan: "70%", actual: "65%", target: "完了", deadline: "7月18日", status: "要注意"),
    PortfolioRow(category: "", categorySpan: 0, initiative: "無停電電源装置\nバッテリー交換", owner: "中村", plan: "100%", actual: "100%", target: "監視移行", deadline: "8月1日", status: "完了"),
    PortfolioRow(category: "運用", categorySpan: 2, initiative: "福岡拠点\n電源切替訓練", owner: "田中", plan: "1回", actual: "1回", target: "2回目", deadline: "8月22日", status: "進行中"),
    PortfolioRow(category: "", categorySpan: 0, initiative: "夜間連絡網の\n自動エスカレーション", owner: "鈴木", plan: "設計", actual: "設計完了", target: "本番化", deadline: "9月12日", status: "進行中"),
    PortfolioRow(category: "環境", categorySpan: 2, initiative: "再エネ証書の\n追加調達", owner: "山本", plan: "5 GWh", actual: "4 GWh", target: "7 GWh", deadline: "9月30日", status: "要注意"),
    PortfolioRow(category: "", categorySpan: 0, initiative: "空調設定温度の\n最適化検証", owner: "伊藤", plan: "3拠点", actual: "2拠点", target: "全拠点", deadline: "9月5日", status: "進行中"),
]
let pRowHeight: CGFloat = 70
for (index, row) in portfolioRows.enumerated() {
    let y = pTop - pHeader * 2 - CGFloat(index + 1) * pRowHeight
    if row.categorySpan > 0 {
        drawCell(
            row.category,
            rect: CGRect(x: pX, y: y - CGFloat(row.categorySpan - 1) * pRowHeight, width: pWidths[0], height: CGFloat(row.categorySpan) * pRowHeight),
            fill: paleBlue,
            size: 10,
            bold: true
        )
    }
    let values = [row.initiative, row.owner, row.plan, row.actual, row.target, row.deadline, row.status]
    var x = pX + pWidths[0]
    for valueIndex in 0..<values.count {
        let columnWidth = pWidths[valueIndex + 1]
        let statusColor: NSColor
        if valueIndex == values.count - 1 {
            statusColor = row.status == "完了" ? NSColor(calibratedRed: 0.86, green: 0.96, blue: 0.88, alpha: 1) : (row.status == "要注意" ? NSColor(calibratedRed: 1, green: 0.91, blue: 0.78, alpha: 1) : paleBlue)
        } else {
            statusColor = index % 2 == 0 ? .white : paleGray
        }
        drawCell(values[valueIndex], rect: CGRect(x: x, y: y, width: columnWidth, height: pRowHeight), fill: statusColor, size: valueIndex == 0 ? 8.5 : 8.2, bold: valueIndex == values.count - 1)
        x += columnWidth
    }
}

fillRect(CGRect(x: 42, y: 125, width: 510, height: 55), color: paleBlue)
drawText("予算メモ", in: CGRect(x: 54, y: 151, width: 75, height: 18), size: 11, bold: true, color: blue)
drawText(
    "Q2実績は4,820万円（予算5,100万円）。Q3は冷却設備対策1,250万円を含む6,400万円を見込む。",
    in: CGRect(x: 128, y: 135, width: 405, height: 34),
    size: 10
)
endPage(2)

// 3ページ目: PNGビットマップとして埋め込むサーモグラフィ画像
beginPage(section: "03 設備画像解析")
drawText("設備画像による異常箇所の確認", in: CGRect(x: 42, y: 755, width: 510, height: 35), size: 22, bold: true, color: navy)
drawText(
    "図1は6月28日22時15分に東京第2拠点で撮影したという想定の、評価用に生成した架空のサーモグラフィ画像である。",
    in: CGRect(x: 44, y: 712, width: 505, height: 35),
    size: 10
)

let thermalImageFrame = CGRect(x: 42, y: 305, width: 510, height: 350)
let bitmapHeight = 680
// Match the bitmap aspect ratio to its PDF frame so AppKit applies the same
// scale in both directions. Keep the existing pixel height and font sizes.
let bitmapWidth = Int(
    round(CGFloat(bitmapHeight) * thermalImageFrame.width / thermalImageFrame.height)
)
guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: bitmapWidth,
    pixelsHigh: bitmapHeight,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    fatalError("評価用画像を作成できませんでした")
}

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor(calibratedRed: 0.03, green: 0.05, blue: 0.11, alpha: 1).setFill()
NSBezierPath(rect: CGRect(x: 0, y: 0, width: bitmapWidth, height: bitmapHeight)).fill()

let imageTitleAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.boldSystemFont(ofSize: 31),
    .foregroundColor: NSColor.white,
]
("東京第2拠点　赤外線設備点検" as NSString).draw(at: NSPoint(x: 55, y: 640), withAttributes: imageTitleAttributes)

let rackLabels = ["ラックA", "ラックB", "ラックC", "ラックD", "ラックE"]
let rackTemperatures = [27.8, 31.2, 38.6, 29.4, 28.1]
let rackStatuses = ["正常", "注意", "高温", "正常", "正常"]
let rackHorizontalMargin: CGFloat = 55
let rackWidth: CGFloat = 155
let rackGap = (
    CGFloat(bitmapWidth) - rackHorizontalMargin * 2 - rackWidth * CGFloat(rackLabels.count)
) / CGFloat(rackLabels.count - 1)
for index in 0..<rackLabels.count {
    let x = rackHorizontalMargin + CGFloat(index) * (rackWidth + rackGap)
    let rackRect = CGRect(x: x, y: 120, width: rackWidth, height: 430)
    NSColor(calibratedRed: 0.10, green: 0.16, blue: 0.24, alpha: 1).setFill()
    NSBezierPath(roundedRect: rackRect, xRadius: 8, yRadius: 8).fill()
    NSColor(calibratedWhite: 0.70, alpha: 1).setStroke()
    let outline = NSBezierPath(roundedRect: rackRect, xRadius: 8, yRadius: 8)
    outline.lineWidth = 3
    outline.stroke()

    for unit in 0..<8 {
        let unitRect = CGRect(x: x + 16, y: 150 + CGFloat(unit) * 45, width: 123, height: 29)
        NSColor(calibratedRed: 0.10, green: 0.36, blue: 0.52, alpha: 1).setFill()
        NSBezierPath(roundedRect: unitRect, xRadius: 3, yRadius: 3).fill()
    }

    let temperature = rackTemperatures[index]
    let heatColor: NSColor = temperature > 35 ? .systemRed : (temperature > 30 ? .systemOrange : .systemGreen)
    heatColor.withAlphaComponent(0.82).setFill()
    let hotY: CGFloat = index == 2 ? 445 : 245 + CGFloat(index % 2) * 70
    NSBezierPath(ovalIn: CGRect(x: x + 44, y: hotY, width: 68, height: 68)).fill()

    let headerAttributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.boldSystemFont(ofSize: 20),
        .foregroundColor: NSColor.white,
    ]
    ("\(rackLabels[index])｜\(rackStatuses[index])" as NSString).draw(at: NSPoint(x: x + 6, y: 603), withAttributes: headerAttributes)
    (rackLabels[index] as NSString).draw(at: NSPoint(x: x + 29, y: 82), withAttributes: headerAttributes)
    let tempAttributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.monospacedDigitSystemFont(ofSize: 23, weight: .bold),
        .foregroundColor: heatColor,
    ]
    (String(format: "%.1f°C", temperature) as NSString).draw(at: NSPoint(x: x + 35, y: 570), withAttributes: tempAttributes)

    if index == 2 {
        let positionAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.boldSystemFont(ofSize: 18),
            .foregroundColor: NSColor.systemRed,
        ]
        ("上部に高温箇所" as NSString).draw(at: NSPoint(x: x + 9, y: 525), withAttributes: positionAttributes)
    }
}

let legendWidth: CGFloat = 210
let legendX = CGFloat(bitmapWidth) - legendWidth - 25
let legendY: CGFloat = 15
let legendHeight: CGFloat = 55
NSColor(calibratedWhite: 0.12, alpha: 0.95).setFill()
NSBezierPath(
    roundedRect: CGRect(x: legendX, y: legendY, width: legendWidth, height: legendHeight),
    xRadius: 8,
    yRadius: 8
).fill()
let legendAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 17),
    .foregroundColor: NSColor.white,
]
("● 正常  ● 注意  ● 高温" as NSString).draw(
    at: NSPoint(x: legendX + 20, y: legendY + 19),
    withAttributes: legendAttributes
)
NSGraphicsContext.restoreGraphicsState()

guard let imageData = bitmap.representation(using: .png, properties: [:]),
      let thermalImage = NSImage(data: imageData) else {
    fatalError("評価用PNGを生成できませんでした")
}
withGraphicsContext {
    thermalImage.draw(
        in: thermalImageFrame,
        from: .zero,
        operation: .copy,
        fraction: 1
    )
}
strokeRect(thermalImageFrame, color: darkGray, width: 1)
drawText(
    "図1　赤外線カメラによるサーバールーム設備点検画像。枠線はラック、色付き領域は表面温度を示す。",
    in: CGRect(x: 44, y: 270, width: 505, height: 28),
    size: 9,
    color: darkGray
)

fillRect(CGRect(x: 42, y: 220, width: 510, height: 48), color: paleBlue)
drawText(
    "ブラインド評価：画像内の値を再掲する本文・表・代替説明は置いていない。回答は埋め込み画像の画素情報だけから抽出すること。",
    in: CGRect(x: 54, y: 229, width: 485, height: 32),
    size: 9,
    bold: true,
    color: blue
)

fillRect(CGRect(x: 42, y: 145, width: 510, height: 42), color: NSColor(calibratedRed: 1, green: 0.93, blue: 0.83, alpha: 1))
drawText(
    "重要：この画像・数値・組織名はすべて解析試験用に生成した架空データであり、実在設備の状態を示すものではない。",
    in: CGRect(x: 55, y: 156, width: 485, height: 23),
    size: 9,
    bold: true
)
endPage(3)

context.closePDF()
print(outputURL.path)
