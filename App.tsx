import { useEffect, useState } from 'react';
import {
  Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Storage from 'expo-sqlite/kv-store';
import { router } from 'expo-router';
import { API_ORIGIN, clearApiKey, createApiTicket, listApiTickets, loadApiKey, saveApiKey, type ApiTicket } from './src/api';

type Department = 'Spoonitöötlus' | 'Järeltöötlus' | 'Üldine';
type Screen = 'form' | 'tickets' | 'settings';
type Form = {
  department: Department; process: string; title: string; description: string;
  photo: string | null; name: string; category: string; priority: string;
};
type Ticket = Omit<Form, 'department'> & {
  department: string; id: string; createdAt: string; status: string; reference?: string; remote?: boolean;
};
type FieldKey = 'department' | 'process' | 'category' | 'priority';

const choices: Record<Department, string[]> = {
  Spoonitöötlus: ['Jätkuliin', 'Vahespoon1', 'Vahespoon3', 'Pinnaspoon', 'Käsiladumine'],
  Järeltöötlus: ['Lihvimisliin', 'Pahteldusliin', 'Formaatsaag Raute'],
  Üldine: ['Üldine'],
};
const departments = Object.keys(choices) as Department[];
const categories = [
  'A3 - Au/el. spoon. käs.', 'A4 - Au/el. liim. & pre', 'A5 - Au/el. Viimistlus',
  'A6 - Au/el. pakkimine', 'AA - Au/el. Üksuse ala.', 'AB - Au/el üld. kommun.',
  'M3 - Meh. spooni käsit.', 'M4 - Meh. liim. & press', 'M5 - Meh. viimistlus',
  'M6 - Meh. pakkimine', 'MA - Mehan. Üksuse ala', 'MB - Meh üld. kommun',
  'P3 - Toot. spooni käsit', 'P4 - Toot. liim.&press', 'P5 - Toot. viimistlus',
  'P6 - Toot. pakkimine',
];
const priorities = ['1 - Väga kõrge', '2 - Kõrge', '3 - Keskmine', '4 - Madal'];
const initial: Form = {
  department: 'Spoonitöötlus', process: '', title: '', description: '', photo: null,
  name: 'Slepko Aleksander', category: '', priority: priorities[2],
};
const STORAGE_KEY = 'oms-parnu-tickets-v1';
const logo = require('./assets/oms-antler.png');
const camera = require('./assets/camera-green.png');

function dateTime(iso: string) {
  return new Date(iso).toLocaleString('et-EE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Ühendus ebaõnnestus. Proovi uuesti.';
}

function fromApiTicket(row: ApiTicket): Ticket {
  return {
    id: `sim-${row.id}`, reference: `SIM-${String(row.id).padStart(6, '0')}`, remote: true,
    createdAt: row.createdAt, status: row.status, title: row.title,
    description: row.description, department: row.department, process: row.process,
    name: row.reporter, priority: row.priority, category: row.details?.messageCategory || '', photo: null,
  };
}

export default function OMSApp({ screen }: { screen: Screen }) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<Form>(initial);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [remoteTickets, setRemoteTickets] = useState<Ticket[]>([]);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [apiError, setApiError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [picker, setPicker] = useState<FieldKey | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([Storage.getItem(STORAGE_KEY), loadApiKey()]).then(async ([local, key]) => {
      if (!active) return;
      if (local) setTickets(JSON.parse(local) as Ticket[]);
      setApiKey(key);
      setKeyDraft(key || '');
      if (key) {
        try {
          const rows = await listApiTickets(key);
          if (active) setRemoteTickets(rows.map(fromApiTicket));
        } catch (cause) { if (active) setApiError(message(cause)); }
      }
    }).catch(() => { if (active) setApiError('Andmeid ei õnnestunud laadida.'); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [screen]);

  const visibleTickets = [...remoteTickets, ...tickets];

  const connect = async () => {
    const key = keyDraft.trim();
    if (!key) { setApiError('Sisesta API võti.'); return; }
    setConnecting(true); setApiError('');
    try {
      await saveApiKey(key);
      setApiKey(key);
      const rows = await listApiTickets(key);
      setRemoteTickets(rows.map(fromApiTicket));
      Alert.alert('Ühendatud', 'OMS simulatsiooni API töötab.');
    } catch (cause) { setApiError(message(cause)); }
    finally { setConnecting(false); }
  };

  const disconnect = async () => {
    await clearApiKey(); setApiKey(null); setKeyDraft(''); setRemoteTickets([]); setApiError('');
  };

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    setError('');
  };
  const options = picker === 'department' ? departments
    : picker === 'process' ? choices[form.department]
    : picker === 'category' ? categories : priorities;
  const choose = (value: string) => {
    if (picker === 'department') {
      setForm(current => ({ ...current, department: value as Department, process: value === 'Üldine' ? 'Üldine' : '' }));
    } else if (picker) set(picker, value);
    setPicker(null);
  };

  const attach = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Kaamera luba', 'Foto tegemiseks anna rakendusele kaamera kasutamise luba.');
          return;
        }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets[0]) set('photo', result.assets[0].uri);
    } catch { Alert.alert('Foto lisamine ebaõnnestus', 'Proovi uuesti.'); }
  };
  const pickPhoto = () => Alert.alert('Lisa pilt', 'Vali pildi allikas', [
    { text: 'Tee foto', onPress: () => attach('camera') },
    { text: 'Vali galeriist', onPress: () => attach('library') },
    { text: 'Tühista', style: 'cancel' },
  ]);

  const save = async () => {
    if (!loaded || saving) return;
    if (!apiKey) { setError('Ühenda OMS simulatsiooni API seadetes.'); return; }
    if (!form.department || !form.process || !form.title.trim() || !form.description.trim()
      || !form.name.trim() || !form.category || !form.priority) {
      setError('Täida kõik kohustuslikud väljad.');
      return;
    }
    setSaving(true); setError('');
    try {
      const saved = await createApiTicket(apiKey, {
        title: form.title.trim(), description: form.description.trim(),
        department: form.department === 'Spoonitöötlus' ? 'Spooni töötlemine' : form.department,
        process: form.process, reporter: form.name.trim(), priority: form.priority,
        messageCategory: form.category, notificationCategory: 'Notification | M1 - Maintenance Request',
        plant: 'Pärnu', factory: 'MWBU - Pärnu Tehas', sapCode: 'PNU',
        sapName: 'PNU - Pärnu kasevineeritehas', status: 'Open',
      }, form.photo);
      setForm(current => ({ ...initial, name: current.name }));
      router.replace('/tickets');
      Alert.alert('Teatis salvestatud', `${saved.reference} on loodud OMS simulatsioonis.`);
    } catch (cause) {
      setError(message(cause));
    } finally { setSaving(false); }
  };

  const field = (label: string, key: FieldKey) => (
    <View style={styles.field} key={key}>
      <Text style={styles.label}>{label}<Text style={styles.required}> *</Text></Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${form[key] || 'Vali'}`}
        onPress={() => setPicker(key)} style={styles.select}>
        <Text style={[styles.value, !form[key] && styles.placeholder]} numberOfLines={1}>{form[key] || 'Vali'}</Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>
    </View>
  );
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 32 : 0);
  const tab = (target: Screen, icon: string, label: string, route: '/' | '/tickets' | '/settings') => (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: screen === target }}
      onPress={() => router.replace(route)} style={[styles.tab, screen === target && styles.activeTab]}>
      <Text style={[styles.tabIcon, screen === target && styles.activeTabIcon]}>{icon}</Text>
      <Text style={[styles.tabText, screen === target && styles.activeTabText]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  return <SafeAreaView style={[styles.safe, Platform.OS === 'android' && {
    paddingTop: Math.max(0, (StatusBar.currentHeight ?? 0) - insets.top),
  }]} edges={['top', 'left', 'right']}>
    <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
    <View style={styles.header}>
      <Image source={logo} style={styles.mark} resizeMode="contain" />
      <View style={styles.brand}><Text style={styles.headerTitle}>OMS PÄRNU</Text><Text style={styles.headerSub}>Hooldustaotlused</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Seaded" onPress={() => router.replace('/settings')} style={styles.profile}>
        <View style={styles.avatar}><Text style={styles.avatarText}>AS</Text></View><Text style={styles.profileArrow}>⌄</Text>
      </Pressable>
    </View>

    <View style={styles.body}>
      {screen === 'form' ? <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <Text style={styles.heading}>Uus taotlus</Text>
          <Text style={styles.intro}>Kirjelda probleemi ja salvesta taotlus.</Text>
          {!apiKey && loaded ? <Pressable onPress={() => router.replace('/settings')} style={styles.connectionNotice}>
            <Text style={styles.connectionNoticeText}>Ühenda API seadetes, et saata teatis OMS simulatsiooni.</Text>
          </Pressable> : null}
          <View style={styles.card}>
            <Text style={styles.section}>ASUKOHT</Text>
            {field('Osakond', 'department')}
            {field('Protsess', 'process')}
            <View style={styles.rule} />
            <Text style={styles.section}>PROBLEEM</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Pealkiri<Text style={styles.required}> *</Text></Text>
              <TextInput value={form.title} onChangeText={value => set('title', value)} placeholder="Näiteks: liin ei käivitu"
                placeholderTextColor={colors.placeholder} maxLength={40} style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Kirjeldus<Text style={styles.required}> *</Text></Text>
              <TextInput value={form.description} onChangeText={value => set('description', value)}
                placeholder="Mis juhtus? Kus täpselt?" placeholderTextColor={colors.placeholder}
                maxLength={1333} multiline textAlignVertical="top" style={[styles.input, styles.textarea]} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Lisa pilt</Text>
              {form.photo ? <View style={styles.photoWrap}>
                <Image source={{ uri: form.photo }} style={styles.photo} />
                <Pressable onPress={() => set('photo', null)} style={styles.remove}><Text style={styles.removeText}>Eemalda foto</Text></Pressable>
              </View> : null}
              <Pressable accessibilityRole="button" onPress={pickPhoto} style={styles.photoButton}>
                <Image source={camera} style={styles.cameraIcon} />
                <View><Text style={styles.photoButtonText}>Lisa pilt</Text><Text style={styles.photoHint}>Tee foto või vali galeriist</Text></View>
              </Pressable>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.half}>{field('Teate kategooria', 'category')}</View>
              <View style={styles.half}>{field('Prioriteet', 'priority')}</View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Nimi<Text style={styles.required}> *</Text></Text>
              <View style={styles.nameWrap}><TextInput value={form.name} onChangeText={value => set('name', value)}
                placeholder="Sinu nimi" placeholderTextColor={colors.placeholder} autoCapitalize="words" style={styles.nameInput} />
                <Text style={styles.personIcon}>●</Text></View>
            </View>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={!loaded || saving} onPress={save}
              style={[styles.save, (!loaded || saving) && styles.disabled]}>
              <Text style={styles.saveText}>{saving ? 'SALVESTAN…' : 'SALVESTA TAOTLUS'}</Text>
            </Pressable>
          </View>
          <Text style={styles.caption}>Uued teatised salvestatakse OMS simulatsiooni. Ühendus töö-OMSiga puudub.</Text>
        </ScrollView>
      </KeyboardAvoidingView> : screen === 'tickets' ? <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>Taotlused</Text>
        <Text style={styles.intro}>{remoteTickets.length} simulatsioonis · {tickets.length} varasemat telefonis</Text>
        {apiError ? <Text accessibilityRole="alert" style={styles.error}>{apiError}</Text> : null}
        {!apiKey && loaded ? <Pressable onPress={() => router.replace('/settings')} style={styles.connectionNotice}>
          <Text style={styles.connectionNoticeText}>Ühenda API, et näha simulatsiooni teatisi.</Text>
        </Pressable> : null}
        {visibleTickets.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>▤</Text>
          <Text style={styles.emptyTitle}>Taotlusi veel ei ole</Text><Text style={styles.emptyText}>Loo esimene hooldustaotlus.</Text>
          <Pressable onPress={() => router.replace('/')} style={styles.emptyButton}><Text style={styles.emptyButtonText}>Uus taotlus</Text></Pressable>
        </View> : visibleTickets.map(ticket => <Pressable accessibilityRole="button" key={ticket.id} onPress={() => setSelected(ticket)} style={styles.ticket}>
          <View style={styles.ticketTop}><Text style={styles.ticketTime}>{dateTime(ticket.createdAt)}</Text><Text style={styles.ticketStatus}>{ticket.remote ? ticket.reference : 'Kohalik'}</Text></View>
          <Text style={styles.ticketTitle}>{ticket.title}</Text><Text style={styles.ticketMeta}>{ticket.department} · {ticket.process}</Text>
          <Text style={styles.ticketDescription} numberOfLines={2}>{ticket.description}</Text>
          <View style={styles.ticketFoot}><Text style={styles.ticketPriority}>{ticket.priority} · {ticket.status}</Text>{ticket.photo ? <Text style={styles.ticketPhoto}>Foto lisatud</Text> : null}</View>
        </Pressable>)}
      </ScrollView> : <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>Seaded</Text><Text style={styles.intro}>OMS simulatsiooni ühendus</Text>
        <View style={styles.card}>
          <Text style={styles.settingsLabel}>API aadress</Text><Text selectable style={styles.settingsValue}>{API_ORIGIN}</Text>
          <View style={styles.rule} />
          <Text style={styles.settingsLabel}>API võti</Text>
          <TextInput value={keyDraft} onChangeText={setKeyDraft} placeholder="Sisesta API võti"
            placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false}
            secureTextEntry style={styles.input} />
          <Text style={styles.keyHint}>Võti salvestatakse selle telefoni turvalisse salvestusruumi.</Text>
          {apiError ? <Text accessibilityRole="alert" style={styles.error}>{apiError}</Text> : null}
          <Pressable onPress={connect} disabled={connecting || !loaded} style={[styles.save, (connecting || !loaded) && styles.disabled]}>
            <Text style={styles.saveText}>{connecting ? 'ÜHENDAN…' : 'ÜHENDA JA KONTROLLI'}</Text>
          </Pressable>
          {apiKey ? <Pressable onPress={disconnect} style={styles.disconnect}><Text style={styles.disconnectText}>Eemalda võti telefonist</Text></Pressable> : null}
          <View style={styles.rule} />
          <Text style={styles.settingsLabel}>Versioon</Text><Text style={styles.settingsValue}>1.0.3</Text>
          <Text style={styles.settingsLabel}>Andmed</Text>
          <Text style={styles.settingsValue}>Uued teatised salvestatakse OMS simulatsiooni. Varasemad kohalikud teatised jäävad telefoni. Ühendus töö-OMSiga puudub.</Text>
        </View>
      </ScrollView>}
    </View>

    <SafeAreaView edges={['bottom']} style={[styles.tabSafeArea, {
      paddingBottom: Platform.OS === 'android' ? Math.max(0, 40 - insets.bottom) : 0,
    }]}>
      <View style={styles.tabs}>
        {tab('form', '✚', 'Uus taotlus', '/')}
        {tab('tickets', '☷', `Taotlused (${visibleTickets.length})`, '/tickets')}
        {tab('settings', '⚙', 'Seaded', '/settings')}
      </View>
    </SafeAreaView>

    <Modal transparent visible={picker !== null} animationType="fade" onRequestClose={() => setPicker(null)}>
      <Pressable style={styles.overlay} onPress={() => setPicker(null)}>
        <View style={[styles.sheet, { paddingBottom: bottomInset + 24 }]}>
          <Text style={styles.sheetTitle}>{picker === 'department' ? 'Osakond' : picker === 'process' ? 'Protsess' : picker === 'category' ? 'Teate kategooria' : 'Prioriteet'}</Text>
          <ScrollView style={styles.optionList} nestedScrollEnabled>
            {options.map(option => <Pressable key={option} onPress={() => choose(option)} style={styles.option}>
              <Text style={styles.optionText}>{option}</Text><Text style={styles.optionCheck}>{picker && form[picker] === option ? '✓' : ''}</Text>
            </Pressable>)}
          </ScrollView>
          <Pressable onPress={() => setPicker(null)} style={styles.cancel}><Text style={styles.cancelText}>Sulge</Text></Pressable>
        </View>
      </Pressable>
    </Modal>
    <Modal transparent visible={selected !== null} animationType="slide" onRequestClose={() => setSelected(null)}>
      <View style={styles.detailOverlay}><ScrollView style={styles.detailSheet} contentContainerStyle={[styles.detailContent, { paddingBottom: bottomInset + 42 }]}>
        <Pressable onPress={() => setSelected(null)} style={styles.close}><Text style={styles.closeText}>Sulge ×</Text></Pressable>
        {selected ? <><Text style={styles.detailEyebrow}>{selected.reference || 'Kohalik'} · {dateTime(selected.createdAt)} · {selected.status}</Text>
          <Text style={styles.detailTitle}>{selected.title}</Text><Text style={styles.detailBody}>{selected.description}</Text>
          {selected.photo ? <Image source={{ uri: selected.photo }} style={styles.detailPhoto} resizeMode="contain" /> : null}
          {([['Osakond', selected.department], ['Protsess', selected.process], ['Nimi', selected.name],
            ['Teate kategooria', selected.category], ['Prioriteet', selected.priority]] as const).map(([label, value]) =>
            <View key={label} style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>)}
        </> : null}
      </ScrollView></View>
    </Modal>
  </SafeAreaView>;
}

const colors = {
  green: '#58A92E', greenDark: '#4D9D28', ink: '#202B3A', muted: '#7B8590',
  border: '#DDE1E5', bg: '#F8FAFB', placeholder: '#9BA3AC',
};
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'white' }, flex: { flex: 1 }, body: { flex: 1, backgroundColor: colors.bg },
  header: { height: 64, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'white' },
  mark: { width: 43, height: 47 }, brand: { flex: 1 },
  headerTitle: { color: colors.ink, fontSize: 19, fontWeight: '800', letterSpacing: 0.1 },
  headerSub: { color: colors.muted, fontSize: 13, marginTop: 1 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 4 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F0F3F5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.ink, fontSize: 13, fontWeight: '700' }, profileArrow: { color: colors.muted, fontSize: 23, marginTop: -8 },
  scroll: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 32 },
  heading: { fontSize: 29, fontWeight: '800', letterSpacing: -0.7, color: colors.ink },
  intro: { color: colors.muted, fontSize: 15, marginTop: 4, marginBottom: 16 },
  card: { backgroundColor: 'white', padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 11, elevation: 1 },
  section: { color: colors.green, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, marginBottom: 12 },
  field: { marginBottom: 14 }, label: { fontSize: 14, color: colors.ink, fontWeight: '700', marginBottom: 7 },
  required: { color: '#DA5C4F' }, select: { borderWidth: 1, borderColor: colors.border, borderRadius: 7,
    minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white' },
  value: { fontSize: 15, color: colors.ink, flex: 1 }, placeholder: { color: colors.placeholder },
  chevron: { color: '#7A8793', fontSize: 24, paddingLeft: 5, marginTop: -8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 7, minHeight: 48, paddingHorizontal: 12,
    fontSize: 15, color: colors.ink, backgroundColor: 'white' },
  textarea: { minHeight: 96, paddingTop: 12, paddingBottom: 12, lineHeight: 21 },
  rule: { height: 1, backgroundColor: '#E7E9EC', marginTop: 3, marginBottom: 18 },
  photoWrap: { marginBottom: 10 }, photo: { height: 140, borderRadius: 8, backgroundColor: colors.bg },
  remove: { position: 'absolute', right: 8, top: 8, backgroundColor: '#FFFFFFEE', padding: 8, borderRadius: 6 },
  removeText: { color: '#B4483D', fontSize: 12, fontWeight: '700' },
  photoButton: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#FBFCFD', borderWidth: 1, borderStyle: 'dashed', borderColor: '#D6DBDF', borderRadius: 8 },
  cameraIcon: { width: 31, height: 31 },
  photoButtonText: { color: colors.ink, fontSize: 14, fontWeight: '700' }, photoHint: { color: colors.muted, fontSize: 11, marginTop: 3 },
  fieldRow: { flexDirection: 'row', gap: 14, marginTop: 6 }, half: { flex: 1, minWidth: 0 },
  nameWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 7 },
  nameInput: { flex: 1, minHeight: 48, paddingHorizontal: 12, fontSize: 15, color: colors.ink },
  personIcon: { color: '#96A0A9', fontSize: 18, marginRight: 14 },
  error: { color: '#B23D32', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  save: { minHeight: 50, borderRadius: 7, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  disabled: { opacity: 0.55 }, saveText: { color: 'white', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  caption: { textAlign: 'center', color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 12, paddingHorizontal: 8 },
  connectionNotice: { borderRadius: 8, backgroundColor: '#EDF7E8', padding: 12, marginBottom: 14 },
  connectionNoticeText: { color: colors.greenDark, fontSize: 13, fontWeight: '700' },
  tabSafeArea: { backgroundColor: 'white' },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border, minHeight: 56 },
  tab: { flex: 1, borderTopWidth: 2, borderTopColor: 'transparent', alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 6, paddingHorizontal: 4 },
  activeTab: { borderTopColor: colors.green }, tabIcon: { color: '#89939C', fontSize: 20, fontWeight: '700' },
  activeTabIcon: { color: colors.green }, tabText: { color: '#87909A', fontSize: 11, fontWeight: '500' },
  activeTabText: { color: colors.greenDark, fontWeight: '700' },
  empty: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, padding: 30, alignItems: 'center', borderRadius: 11 },
  emptyIcon: { fontSize: 34, color: colors.green }, emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 12 },
  emptyText: { color: colors.muted, fontSize: 14, marginTop: 5 },
  emptyButton: { marginTop: 20, backgroundColor: colors.green, borderRadius: 7, paddingVertical: 11, paddingHorizontal: 18 },
  emptyButtonText: { color: 'white', fontWeight: '700' },
  ticket: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, padding: 17, borderRadius: 11, marginBottom: 11 },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, ticketTime: { color: colors.muted, fontSize: 12 },
  ticketStatus: { color: colors.greenDark, backgroundColor: '#EDF7E8', overflow: 'hidden', paddingHorizontal: 8,
    paddingVertical: 4, borderRadius: 4, fontSize: 12, fontWeight: '700' },
  ticketTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 10 },
  ticketMeta: { color: colors.greenDark, fontSize: 14, fontWeight: '700', marginTop: 5 },
  ticketDescription: { color: '#596572', fontSize: 14, lineHeight: 20, marginTop: 8 },
  ticketFoot: { flexDirection: 'row', gap: 12, marginTop: 12 }, ticketPriority: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  ticketPhoto: { color: colors.greenDark, fontSize: 12, fontWeight: '700' },
  settingsLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 5 },
  settingsValue: { color: colors.ink, fontSize: 15, lineHeight: 22, marginBottom: 16 },
  keyHint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 8, marginBottom: 14 },
  disconnect: { alignItems: 'center', padding: 13 },
  disconnectText: { color: '#B4483D', fontSize: 13, fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#1C2735A8' },
  sheet: { maxHeight: '85%', backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', marginBottom: 12 }, optionList: { flexShrink: 1 },
  option: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#ECEEF0' },
  optionText: { flex: 1, color: colors.ink, fontSize: 16 }, optionCheck: { color: colors.green, fontSize: 20, fontWeight: '700' },
  cancel: { alignItems: 'center', marginTop: 15, padding: 12 }, cancelText: { color: colors.greenDark, fontSize: 15, fontWeight: '700' },
  detailOverlay: { flex: 1, backgroundColor: '#1C2735A8', paddingTop: 70 },
  detailSheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  detailContent: { padding: 24 }, close: { alignSelf: 'flex-end', padding: 5, marginBottom: 20 },
  closeText: { color: colors.greenDark, fontWeight: '700', fontSize: 15 }, detailEyebrow: { color: colors.muted, fontSize: 13 },
  detailTitle: { color: colors.ink, fontSize: 26, fontWeight: '800', marginTop: 10 },
  detailBody: { color: '#344B60', fontSize: 16, lineHeight: 24, marginTop: 18, marginBottom: 20 },
  detailPhoto: { height: 240, width: '100%', backgroundColor: colors.bg, borderRadius: 9, marginBottom: 16 },
  detailRow: { paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 15 },
  detailLabel: { width: 112, color: colors.muted, fontSize: 14 },
  detailValue: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'right' },
});
