#include <napi.h>
#include "audio_capture.h"
#include <memory>
#include <mutex>
#include <queue>
#include <fstream>

class WasapiLoopback : public Napi::ObjectWrap<WasapiLoopback> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    WasapiLoopback(const Napi::CallbackInfo& info);
    ~WasapiLoopback();

private:
    static Napi::FunctionReference constructor;

    Napi::Value Initialize(const Napi::CallbackInfo& info);
    Napi::Value Start(const Napi::CallbackInfo& info);
    Napi::Value Stop(const Napi::CallbackInfo& info);
    Napi::Value IsCapturing(const Napi::CallbackInfo& info);
    Napi::Value GetLastError(const Napi::CallbackInfo& info);
    Napi::Value SaveToWav(const Napi::CallbackInfo& info);
    Napi::Value GetSampleRate(const Napi::CallbackInfo& info);
    Napi::Value GetChannels(const Napi::CallbackInfo& info);

    std::unique_ptr<AudioCapture> m_capture;
    std::mutex m_bufferMutex;
    std::vector<int16_t> m_audioBuffer;
    int m_capturedSampleRate = 0;
    int m_capturedChannels = 0;
};

Napi::FunctionReference WasapiLoopback::constructor;

Napi::Object WasapiLoopback::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "WasapiLoopback", {
        InstanceMethod("initialize", &WasapiLoopback::Initialize),
        InstanceMethod("start", &WasapiLoopback::Start),
        InstanceMethod("stop", &WasapiLoopback::Stop),
        InstanceMethod("isCapturing", &WasapiLoopback::IsCapturing),
        InstanceMethod("getLastError", &WasapiLoopback::GetLastError),
        InstanceMethod("saveToWav", &WasapiLoopback::SaveToWav),
        InstanceMethod("getSampleRate", &WasapiLoopback::GetSampleRate),
        InstanceMethod("getChannels", &WasapiLoopback::GetChannels),
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("WasapiLoopback", func);
    return exports;
}

WasapiLoopback::WasapiLoopback(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<WasapiLoopback>(info) {
    m_capture = std::make_unique<AudioCapture>();
}

WasapiLoopback::~WasapiLoopback() {
    if (m_capture && m_capture->IsCapturing()) {
        m_capture->Stop();
    }
}

Napi::Value WasapiLoopback::Initialize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    bool result = m_capture->Initialize();
    return Napi::Boolean::New(env, result);
}

Napi::Value WasapiLoopback::Start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Clear previous buffer
    {
        std::lock_guard<std::mutex> lock(m_bufferMutex);
        m_audioBuffer.clear();
    }

    // Start capture with callback that accumulates samples
    bool result = m_capture->Start([this](const std::vector<int16_t>& samples, int sampleRate, int channels) {
        std::lock_guard<std::mutex> lock(m_bufferMutex);
        m_audioBuffer.insert(m_audioBuffer.end(), samples.begin(), samples.end());
        m_capturedSampleRate = sampleRate;
        m_capturedChannels = channels;
    });

    return Napi::Boolean::New(env, result);
}

Napi::Value WasapiLoopback::Stop(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    m_capture->Stop();
    return env.Undefined();
}

Napi::Value WasapiLoopback::IsCapturing(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, m_capture->IsCapturing());
}

Napi::Value WasapiLoopback::GetLastError(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::String::New(env, m_capture->GetLastError());
}

Napi::Value WasapiLoopback::GetSampleRate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Number::New(env, m_capture->GetSampleRate());
}

Napi::Value WasapiLoopback::GetChannels(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Number::New(env, m_capture->GetChannels());
}

Napi::Value WasapiLoopback::SaveToWav(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "String expected for file path").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string filePath = info[0].As<Napi::String>().Utf8Value();
    int targetSampleRate = 16000; // Whisper requires 16kHz

    if (info.Length() > 1 && info[1].IsNumber()) {
        targetSampleRate = info[1].As<Napi::Number>().Int32Value();
    }

    std::vector<int16_t> samples;
    int sourceSampleRate;
    int sourceChannels;

    {
        std::lock_guard<std::mutex> lock(m_bufferMutex);
        samples = m_audioBuffer;
        sourceSampleRate = m_capturedSampleRate;
        sourceChannels = m_capturedChannels;
        m_audioBuffer.clear(); // Clear buffer after saving
    }

    if (samples.empty()) {
        return Napi::Boolean::New(env, false);
    }

    // Convert stereo to mono if needed
    std::vector<int16_t> monoSamples;
    if (sourceChannels == 2) {
        monoSamples.resize(samples.size() / 2);
        for (size_t i = 0; i < monoSamples.size(); i++) {
            int32_t left = samples[i * 2];
            int32_t right = samples[i * 2 + 1];
            monoSamples[i] = (int16_t)((left + right) / 2);
        }
    } else {
        monoSamples = samples;
    }

    // Resample to target rate if needed
    std::vector<int16_t> resampledSamples;
    if (sourceSampleRate != targetSampleRate) {
        // Simple linear interpolation resampling
        double ratio = (double)sourceSampleRate / targetSampleRate;
        size_t newSize = (size_t)(monoSamples.size() / ratio);
        resampledSamples.resize(newSize);

        for (size_t i = 0; i < newSize; i++) {
            double srcIndex = i * ratio;
            size_t srcIndexInt = (size_t)srcIndex;
            double frac = srcIndex - srcIndexInt;

            if (srcIndexInt + 1 < monoSamples.size()) {
                resampledSamples[i] = (int16_t)(
                    monoSamples[srcIndexInt] * (1.0 - frac) +
                    monoSamples[srcIndexInt + 1] * frac
                );
            } else {
                resampledSamples[i] = monoSamples[srcIndexInt];
            }
        }
    } else {
        resampledSamples = monoSamples;
    }

    // Write WAV file
    std::ofstream file(filePath, std::ios::binary);
    if (!file.is_open()) {
        return Napi::Boolean::New(env, false);
    }

    // WAV header
    uint32_t dataSize = resampledSamples.size() * sizeof(int16_t);
    uint32_t fileSize = 36 + dataSize;
    uint16_t audioFormat = 1; // PCM
    uint16_t numChannels = 1; // Mono
    uint32_t sampleRate = targetSampleRate;
    uint32_t byteRate = sampleRate * numChannels * sizeof(int16_t);
    uint16_t blockAlign = numChannels * sizeof(int16_t);
    uint16_t bitsPerSample = 16;

    // RIFF header
    file.write("RIFF", 4);
    file.write((char*)&fileSize, 4);
    file.write("WAVE", 4);

    // fmt chunk
    file.write("fmt ", 4);
    uint32_t fmtChunkSize = 16;
    file.write((char*)&fmtChunkSize, 4);
    file.write((char*)&audioFormat, 2);
    file.write((char*)&numChannels, 2);
    file.write((char*)&sampleRate, 4);
    file.write((char*)&byteRate, 4);
    file.write((char*)&blockAlign, 2);
    file.write((char*)&bitsPerSample, 2);

    // data chunk
    file.write("data", 4);
    file.write((char*)&dataSize, 4);
    file.write((char*)resampledSamples.data(), dataSize);

    file.close();
    return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return WasapiLoopback::Init(env, exports);
}

NODE_API_MODULE(wasapi_loopback, Init)
