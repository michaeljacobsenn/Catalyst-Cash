const fs = require('fs');
const file = './src/modules/components.jsx';
let content = fs.readFileSync(file, 'utf8');

const newStreamingView = `export const StreamingView = ({ streamText, elapsed, isTest, modelName }) => {
    const isReceiving = !!streamText && streamText.length > 5;
    const maxTime = 6; 
    const baseProgress = Math.min(((elapsed + 1) / maxTime) * 100, 95);
    const progress = isReceiving ? 100 : baseProgress;
    
    let currentMsg = "Bundling financial profile...";
    if (isReceiving) currentMsg = "STREAMING AUDIT PAYLOAD...";
    else if (elapsed > 4) currentMsg = "Generating tactical recommendations...";
    else if (elapsed > 2) currentMsg = "Analyzing weekly transactions...";
    else if (elapsed > 0) currentMsg = "Opening secure AI session...";

    return (
        <div style={{ padding: "24px 16px", animation: "fadeIn .4s ease-out forwards" }}>
            <div style={{ textAlign: "center", marginBottom: isReceiving ? 16 : 32, transition: "margin .4s ease" }}>
                <div style={{
                    width: isReceiving ? 48 : 64, height: isReceiving ? 48 : 64, borderRadius: 20, margin: "0 auto 16px", 
                    background: isReceiving ? \`\${T.status.green}15\` : T.accent.primaryDim,
                    border: \`1px solid \${isReceiving ? T.status.green : T.accent.primarySoft}\`, 
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: isReceiving ? \`0 0 20px \${T.status.green}40\` : T.shadow.glow,
                    transition: "all .5s cubic-bezier(.16,1,.3,1)"
                }}>
                    <Loader2 size={isReceiving ? 20 : 28} color={isReceiving ? T.status.green : T.accent.primary} style={{ animation: "spin .8s linear infinite" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
                    <p style={{ fontSize: isReceiving ? 15 : 18, fontWeight: 800, transition: "font-size .4s ease" }}>Running Audit</p>
                    {isTest && <Badge variant="amber">TEST</Badge>}
                </div>
                <Mono size={11} color={T.text.dim} style={{ display: "block", marginBottom: 16 }}>
                    {elapsed}s · {modelName || "AI"}{isTest ? " · NOT SAVED" : ""}
                </Mono>
                
                {/* Progress Bar Container */}
                <div style={{ maxWidth: 320, margin: "0 auto", textAlign: "left" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.02em", color: isReceiving ? T.status.green : T.accent.primary, fontFamily: T.font.mono, transition: "color .4s ease" }}>
                            {currentMsg}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: T.text.secondary, fontFamily: T.font.mono }}>
                            {Math.floor(progress)}%
                        </span>
                    </div>
                    <div style={{ height: 6, background: T.bg.elevated, borderRadius: 6, overflow: "hidden", border: \`1px solid \${T.border.subtle}\` }}>
                        <div style={{
                            height: "100%", width: \`\${progress}%\`, 
                            background: isReceiving ? \`linear-gradient(90deg,\${T.status.green}AA,\${T.status.green})\` : \`linear-gradient(90deg,\${T.accent.emerald}99,\${T.accent.emerald})\`,
                            borderRadius: 6, transition: "width 1.2s cubic-bezier(.16,1,.3,1), background .5s ease"
                        }} />
                    </div>
                </div>
            </div>
            
            {streamText ? (
                <div className="slide-up">
                    <Card style={{ maxHeight: "50vh", overflow: "auto", border: \`1px solid \${T.status.blue}30\`, background: T.bg.elevated, boxShadow: \`inset 0 4px 24px \${T.bg.base}\` }}>
                        <pre style={{
                            fontSize: 10, lineHeight: 1.6, color: T.text.secondary, whiteSpace: "pre-wrap", wordBreak: "break-word",
                            fontFamily: T.font.mono, opacity: 0.9
                        }}>{streamText}<span style={{ 
                            display: "inline-block", width: 7, height: 14, background: T.status.green,
                            animation: "pulse 1s ease infinite", verticalAlign: "text-bottom", borderRadius: 2, marginLeft: 3
                        }} /></pre>
                    </Card>
                </div>
            ) : (
                <div style={{ transition: "opacity .3s ease", opacity: 0.8 }}>
                    {[120, 80, 150].map((h, i) =>
                    <div key={i} className="shimmer-bg" style={{ height: h, borderRadius: T.radius.lg, marginBottom: 12, animationDelay: \`\${i * .12}s\`, opacity: 0.7 + (i * 0.1) }} />)}
                </div>
            )}
        </div>
    );
};`;

// Use regex to replace the function
const regex = /export const StreamingView = \(\{ streamText, elapsed, isTest, modelName \}\) => \{[\s\S]*?^\};\n?/m;

if (regex.test(content)) {
    const updated = content.replace(regex, newStreamingView + '\n\n');
    fs.writeFileSync(file, updated);
    console.log("Success");
} else {
    console.log("Failed to match StreamingView");
}
