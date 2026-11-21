# Нагрузочный тест API Farm Stars.
# Запуск: powershell -NoProfile -ExecutionPolicy Bypass -File tools\loadtest.ps1 https://farm-stars.onrender.com
param([string]$Base = "http://127.0.0.1:8092")

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

public static class LoadTest {
    private static double Pct(List<double> sorted, double p) {
        if (sorted.Count == 0) return 0;
        int idx = (int)Math.Floor(sorted.Count * p);
        if (idx >= sorted.Count) idx = sorted.Count - 1;
        return sorted[idx];
    }

    public static string Run(string baseUrl, string path, string deviceId, int total, int concurrency) {
        var handler = new HttpClientHandler();
        handler.MaxConnectionsPerServer = concurrency;
        using (var client = new HttpClient(handler)) {
            client.Timeout = TimeSpan.FromSeconds(60);
            var results = new double[total];
            int next = -1;
            var tasks = new List<Task>();
            var wall = Stopwatch.StartNew();
            for (int w = 0; w < concurrency; w++) {
                tasks.Add(Task.Run(async () => {
                    while (true) {
                        int i = Interlocked.Increment(ref next);
                        if (i >= total) break;
                        var req = new HttpRequestMessage(HttpMethod.Get, baseUrl + path);
                        if (deviceId != null && deviceId.Length > 0) req.Headers.Add("X-Device-Id", deviceId);
                        var sw = Stopwatch.StartNew();
                        try {
                            var resp = await client.SendAsync(req);
                            await resp.Content.ReadAsByteArrayAsync();
                            sw.Stop();
                            results[i] = resp.IsSuccessStatusCode ? sw.Elapsed.TotalMilliseconds : -sw.Elapsed.TotalMilliseconds;
                        } catch {
                            sw.Stop();
                            results[i] = -1;
                        }
                    }
                }));
            }
            Task.WaitAll(tasks.ToArray());
            wall.Stop();

            var ok = new List<double>();
            foreach (double r in results) if (r > 0) ok.Add(r);
            ok.Sort();

            return string.Format("{0} зпр., парал. {1} -> ок {2}, ошибок {3}, {4:F2} с, {5:F0} запр/с, p50 {6:F0} мс, p95 {7:F0} мс, max {8:F0} мс",
                total, concurrency, ok.Count, total - ok.Count, wall.Elapsed.TotalSeconds,
                total / wall.Elapsed.TotalSeconds, Pct(ok, 0.5), Pct(ok, 0.95),
                ok.Count > 0 ? ok[ok.Count - 1] : 0);
        }
    }
}
"@ -Language CSharp -ReferencedAssemblies System.Net.Http

"== $Base =="
[LoadTest]::Run($Base, '/api/health', '', 100, 100)
[LoadTest]::Run($Base, '/api/me', 'loadtest-fixed', 100, 100)
[LoadTest]::Run($Base, '/api/me', 'loadtest-fixed', 300, 100)
[LoadTest]::Run($Base, '/api/me', 'loadtest-fixed', 500, 500)
