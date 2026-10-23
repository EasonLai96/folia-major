package top.izuna.foliamajor.qishui;

// A failure that may cross the plugin bridge: code, safe sentence and optional upstream code.
public class QishuiException extends Exception {

    private final String code;
    private final String upstreamCode;
    private String stage;

    public QishuiException(String code, String message) {
        this(code, message, null, null);
    }

    public QishuiException(String code, String message, String upstreamCode) {
        this(code, message, upstreamCode, null);
    }

    public QishuiException(String code, String message, String upstreamCode, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.upstreamCode = upstreamCode;
    }

    public String code() {
        return code;
    }

    public String upstreamCode() {
        return upstreamCode;
    }

    public String stage() {
        return stage;
    }

    public QishuiException withStage(String value) {
        if (stage == null) stage = value;
        return this;
    }
}
