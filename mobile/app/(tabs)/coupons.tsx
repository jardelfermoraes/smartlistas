import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { theme } from '@/lib/theme';

type SubmissionOut = {
  id: number;
  chave_acesso: string;
  source: string;
  status: string;
  created_at: string;
};

function extractChaveFromText(raw: string): string | null {
  const digits = (raw || '').replace(/\D+/g, '');
  if (digits.length === 44) return digits;
  const m = digits.match(/\d{44}/);
  return m ? m[0] : null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  try {
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function CouponsScreen() {
  const { tokens } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<'qr' | 'barcode' | 'manual'>('qr');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const [rawText, setRawText] = useState('');
  const [chave, setChave] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<SubmissionOut[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const derivedChave = useMemo(() => extractChaveFromText(rawText), [rawText]);

  useEffect(() => {
    setChave(derivedChave);
  }, [derivedChave]);

  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      if (!tokens?.access_token) {
        setHistory([]);
        return;
      }
      const data = await apiGet<SubmissionOut[]>('/app/receipt-keys', undefined, { token: tokens.access_token });
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      // silencioso
    } finally {
      setIsLoadingHistory(false);
    }
  }, [tokens?.access_token]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function openScanner(nextMode: 'qr' | 'barcode') {
    setError(null);
    setSuccessMsg(null);

    const granted = permission?.granted ?? false;
    if (!granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setError('Permissão de câmera negada');
        return;
      }
    }

    setMode(nextMode);
    setHasScanned(false);
    setScannerVisible(true);
  }

  async function submit() {
    setError(null);
    setSuccessMsg(null);

    if (!tokens?.access_token) {
      setError('Você precisa estar logado para enviar cupom');
      return;
    }
    const extracted = extractChaveFromText(rawText);
    if (!extracted) {
      setError('Não encontrei a chave de acesso (44 dígitos). Cole a chave ou escaneie novamente.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiPost<{ id: number; status: string; message: string }>(
        '/app/receipt-keys',
        { raw_text: rawText.trim() || null, chave_acesso: extracted, source: mode },
        { token: tokens.access_token }
      );
      setSuccessMsg(res.message || 'Enviado!');
      setRawText('');
      setChave(null);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar cupom');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Enviar cupom</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void loadHistory()}>
          <Text style={styles.refreshText}>{isLoadingHistory ? '...' : 'Atualizar'}</Text>
        </Pressable>
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Enviar chave</Text>
        <Text style={styles.cardText}>Você pode escanear QR Code, código de barras ou colar a chave (44 dígitos).</Text>

        <View style={styles.actionsRow}>
          <Button variant="secondary" style={styles.actionBtn} onPress={() => void openScanner('qr')}>
            Escanear QR
          </Button>
          <Button variant="secondary" style={styles.actionBtn} onPress={() => void openScanner('barcode')}>
            Escanear barras
          </Button>
        </View>

        <Input
          label="Texto do QR / Código de barras / Chave"
          value={rawText}
          onChangeText={setRawText}
          placeholder="Cole aqui a chave (44 dígitos) ou o texto do QR..."
          autoCapitalize="none"
        />

        {chave ? (
          <Text style={styles.previewOk}>Chave detectada: {chave}</Text>
        ) : rawText.trim().length > 0 ? (
          <Text style={styles.previewWarn}>Não detectei a chave (44 dígitos) ainda.</Text>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {successMsg ? <Text style={styles.successText}>{successMsg}</Text> : null}

        <View style={styles.actionsRow}>
          <Button onPress={() => void submit()} disabled={isSubmitting} style={styles.submitBtn}>
            {isSubmitting ? 'Enviando...' : 'Enviar'}
          </Button>
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Histórico</Text>
          <Text style={styles.cardText}>{tokens?.access_token ? `${history.length} envio(s)` : 'Faça login para ver seus envios.'}</Text>
        </View>

        <FlatList
          data={history}
          keyExtractor={(it) => String(it.id)}
          scrollEnabled={false}
          ListEmptyComponent={<Text style={styles.cardText}>{tokens?.access_token ? 'Nenhum envio ainda.' : ''}</Text>}
          renderItem={({ item }) => (
            <View style={styles.historyRow}>
              <View style={{ flex: 1, backgroundColor: 'transparent' }}>
                <Text style={styles.historyTitle} numberOfLines={1}>
                  {item.chave_acesso}
                </Text>
                <Text style={styles.historySub} numberOfLines={1}>
                  {formatDate(item.created_at)} • {item.source} • {item.status}
                </Text>
              </View>
            </View>
          )}
        />
      </Card>

      <Modal visible={scannerVisible} transparent animationType="fade" onRequestClose={() => setScannerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{mode === 'barcode' ? 'Escanear código de barras' : 'Escanear QR Code'}</Text>
            <Text style={styles.modalSub}>Aponte a câmera para o código. Ao detectar, vamos preencher automaticamente.</Text>

            <View style={styles.cameraBox}>
              <CameraView
                style={StyleSheet.absoluteFill}
                barcodeScannerSettings={{
                  barcodeTypes: mode === 'barcode' ? ['ean13', 'ean8', 'code128', 'code39', 'itf14', 'upc_a', 'upc_e'] : ['qr'],
                }}
                onBarcodeScanned={(result) => {
                  if (hasScanned) return;
                  if (!result?.data) return;
                  setHasScanned(true);
                  setRawText(result.data);
                  setScannerVisible(false);
                }}
              />
            </View>

            <View style={styles.modalActions}>
              <Button variant="secondary" onPress={() => setScannerVisible(false)} style={styles.modalBtn}>
                Fechar
              </Button>
              <Button
                onPress={() => {
                  setHasScanned(false);
                }}
                style={styles.modalBtn}>
                Tentar de novo
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.bold,
    color: theme.colors.text.primary,
  },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.bg.surface,
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.muted,
  },
  card: {
    marginTop: theme.spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontWeight: theme.font.weight.bold,
    color: theme.colors.text.primary,
  },
  cardText: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text.muted,
  },
  actionsRow: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    height: 42,
  },
  submitBtn: {
    flex: 1,
    height: 46,
  },
  previewOk: {
    marginTop: theme.spacing.sm,
    color: theme.colors.brand.primaryDark,
    fontSize: theme.font.size.xs,
    fontWeight: '700',
  },
  previewWarn: {
    marginTop: theme.spacing.sm,
    color: theme.colors.text.muted,
    fontSize: theme.font.size.xs,
    fontWeight: '600',
  },
  errorText: {
    marginTop: theme.spacing.sm,
    color: theme.colors.danger.text,
    fontSize: theme.font.size.xs,
  },
  successText: {
    marginTop: theme.spacing.sm,
    color: theme.colors.brand.primaryDark,
    fontSize: theme.font.size.xs,
    fontWeight: '700',
  },
  historyRow: {
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.bg.surface,
  },
  historyTitle: {
    fontWeight: '800',
    fontSize: 12,
    color: theme.colors.text.primary,
  },
  historySub: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.text.muted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
    padding: theme.spacing.lg,
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: theme.colors.bg.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    padding: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.bold,
    color: theme.colors.text.primary,
  },
  modalSub: {
    marginTop: 6,
    marginBottom: theme.spacing.md,
    fontSize: theme.font.size.sm,
    color: theme.colors.text.muted,
  },
  modalActions: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    height: 42,
  },
  cameraBox: {
    width: '100%',
    height: 320,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.bg.surfaceAlt,
  },
});
