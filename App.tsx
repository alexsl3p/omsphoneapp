import { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import { router } from 'expo-router';

type Department = 'Spoonitöötlus' | 'Järeltöötlus' | 'Üldine';
type Form = { department: Department; process: string; title: string; description: string; photo: string | null; name: string; category: string; priority: string };
type Ticket = Form & { id: string; createdAt: string; status: 'Uus' };
const choices: Record<Department, string[]> = {
  Spoonitöötlus: ['Jätkuliin', 'Vahespoon1', 'Vahespoon3', 'Pinnaspoon', 'Käsiladumine'],
  Järeltöötlus: ['Lihvimisliin', 'Pahteldusliin', 'Formaatsaag Raute'],
  Üldine: ['Üldine'],
};
const departments = Object.keys(choices) as Department[];
const categories = ['Notification | M1 - Maintenance Request'];
const priorities = ['1 - Väga kõrge', '2 - Kõrge', '3 - Keskmine', '4 - Madal'];
const initial: Form = { department: 'Spoonitöötlus', process: '', title: '', description: '', photo: null, name: 'Slepko Aleksander', category: categories[0], priority: priorities[2] };
const STORAGE_KEY = 'oms-parnu-tickets-v1';

type FieldKey = 'department' | 'process' | 'category' | 'priority';
function dateTime(iso: string) { return new Date(iso).toLocaleString('et-EE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

export default function OMSApp({ screen }: { screen: 'form' | 'tickets' }) {
  const [form, setForm] = useState<Form>(initial);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [picker, setPicker] = useState<FieldKey | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Storage.getItem(STORAGE_KEY).then(value => {
      if (value) setTickets(JSON.parse(value) as Ticket[]);
    }).catch(() => setError('Salvestatud taotlusi ei õnnestunud laadida.')).finally(() => setLoaded(true));
  }, []);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => { setForm(current => ({ ...current, [key]: value })); setError(''); };
  const options = picker === 'department' ? departments : picker === 'process' ? choices[form.department] : picker === 'category' ? categories : priorities;
  const choose = (value: string) => {
    if (picker === 'department') setForm(current => ({ ...current, department: value as Department, process: value === 'Üldine' ? 'Üldine' : '' }));
    else if (picker) set(picker, value);
    setPicker(null);
  };
  const attach = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { Alert.alert('Kaamera luba', 'Foto tegemiseks anna rakendusele kaamera kasutamise luba.'); return; }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets[0]) set('photo', result.assets[0].uri);
    } catch { Alert.alert('Foto lisamine ebaõnnestus', 'Proovi uuesti.'); }
  };
  const save = async () => {
    if (!loaded || saving) return;
    if (!form.department || !form.process || !form.title.trim() || !form.description.trim() || !form.name.trim() || !form.category || !form.priority) {
      setError('Täida kõik kohustuslikud väljad.'); return;
    }
    setSaving(true); setError('');
    let copiedPhoto: File | null = null;
    try {
      if (form.photo) {
        const dir = new Directory(Paths.document, 'oms-photos');
        if (!dir.exists) dir.create();
        const extension = form.photo.split('?')[0].match(/\.(png|jpe?g|webp|heic)$/i)?.[1]?.toLowerCase() ?? 'jpg';
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
        copiedPhoto = new File(dir, filename);
        new File(form.photo).copy(copiedPhoto);
      }
      const ticket: Ticket = {
        ...form, title: form.title.trim(), description: form.description.trim(), name: form.name.trim(),
        photo: copiedPhoto?.uri ?? null, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(), status: 'Uus',
      };
      const next = [ticket, ...tickets];
      await Storage.setItem(STORAGE_KEY, JSON.stringify(next));
      setTickets(next); setForm(current => ({ ...initial, name: current.name })); router.replace('/tickets');
      Alert.alert('Taotlus salvestatud', 'Taotlus on salvestatud sellesse telefoni.');
    } catch {
      try { copiedPhoto?.delete(); } catch { /* No copied photo to remove. */ }
      setError('Salvestamine ebaõnnestus. Proovi uuesti.');
    } finally { setSaving(false); }
  };
  const field = (label: string, key: FieldKey, required = true) => (
    <View style={styles.field} key={key}>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${form[key] || 'Vali'}`} onPress={() => setPicker(key)} style={styles.select}>
        <Text style={[styles.value, !form[key] && styles.placeholder]} numberOfLines={1}>{form[key] || 'Vali'}</Text><Text style={styles.chevron}>⌄</Text>
      </Pressable>
    </View>
  );
  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="light-content" backgroundColor="#152B43" />
    <View style={styles.header}><View style={styles.mark}><Text style={styles.markText}>O</Text></View><View><Text style={styles.headerTitle}>OMS Pärnu</Text><Text style={styles.headerSub}>Hooldustaotlused</Text></View><View style={styles.local}><Text style={styles.localText}>KOHALIK</Text></View></View>
    <View style={styles.body}>
      {screen === 'form' ? <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <Text style={styles.heading}>Uus taotlus</Text><Text style={styles.intro}>Kirjelda probleemi ja salvesta taotlus.</Text>
          <View style={styles.card}>
            <Text style={styles.section}>ASUKOHT</Text>
            {field('Osakond', 'department')}{field('Protsess', 'process')}
            <View style={styles.rule}/><Text style={styles.section}>PROBLEEM</Text>
            <View style={styles.field}><Text style={styles.label}>Pealkiri<Text style={styles.required}> *</Text></Text><TextInput value={form.title} onChangeText={value => set('title', value)} placeholder="Näiteks: liin ei käivitu" placeholderTextColor="#92A1AF" maxLength={40} style={styles.input}/></View>
            <View style={styles.field}><Text style={styles.label}>Kirjeldus<Text style={styles.required}> *</Text></Text><TextInput value={form.description} onChangeText={value => set('description', value)} placeholder="Mis juhtus? Kus täpselt?" placeholderTextColor="#92A1AF" maxLength={1333} multiline textAlignVertical="top" style={[styles.input, styles.textarea]}/></View>
            <View style={styles.field}><Text style={styles.label}>Lisa pilt <Text style={styles.optional}>(valikuline)</Text></Text>
              {form.photo ? <View style={styles.photoWrap}><Image source={{ uri: form.photo }} style={styles.photo}/><Pressable onPress={() => set('photo', null)} style={styles.remove}><Text style={styles.removeText}>Eemalda foto</Text></Pressable></View> : null}
              <View style={styles.photoActions}><Pressable onPress={() => attach('camera')} style={styles.photoButton}><Text style={styles.photoButtonText}>Tee foto</Text></Pressable><Pressable onPress={() => attach('library')} style={styles.photoButton}><Text style={styles.photoButtonText}>Vali galeriist</Text></Pressable></View>
            </View>
            <View style={styles.rule}/><Text style={styles.section}>TEATE ANDMED</Text>
            <View style={styles.field}><Text style={styles.label}>Nimi<Text style={styles.required}> *</Text></Text><TextInput value={form.name} onChangeText={value => set('name', value)} placeholder="Sinu nimi" placeholderTextColor="#92A1AF" autoCapitalize="words" style={styles.input}/></View>
            {field('Teate kategooria', 'category')}{field('Prioriteet', 'priority')}
          </View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={!loaded || saving} onPress={save} style={[styles.save, (!loaded || saving) && styles.disabled]}><Text style={styles.saveText}>{saving ? 'Salvestan…' : 'Loo taotlus'}</Text></Pressable>
          <Text style={styles.caption}>Taotlus salvestatakse ainult sellesse telefoni. Ühendus töö-OMSiga puudub.</Text>
        </ScrollView>
      </KeyboardAvoidingView> : <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>Taotlused</Text><Text style={styles.intro}>{tickets.length ? `${tickets.length} kohalikult salvestatud taotlust` : 'Siin kuvatakse sinu loodud taotlused.'}</Text>
        {tickets.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>▤</Text><Text style={styles.emptyTitle}>Taotlusi veel ei ole</Text><Text style={styles.emptyText}>Loo esimene hooldustaotlus.</Text><Pressable onPress={() => router.replace('/')} style={styles.emptyButton}><Text style={styles.emptyButtonText}>Uus taotlus</Text></Pressable></View> : tickets.map(ticket => <Pressable accessibilityRole="button" key={ticket.id} onPress={() => setSelected(ticket)} style={styles.ticket}><View style={styles.ticketTop}><Text style={styles.ticketTime}>{dateTime(ticket.createdAt)}</Text><Text style={styles.ticketStatus}>{ticket.status}</Text></View><Text style={styles.ticketTitle}>{ticket.title}</Text><Text style={styles.ticketMeta}>{ticket.department} · {ticket.process}</Text><Text style={styles.ticketDescription} numberOfLines={2}>{ticket.description}</Text><View style={styles.ticketFoot}><Text style={styles.ticketPriority}>{ticket.priority}</Text>{ticket.photo ? <Text style={styles.ticketPhoto}>Foto lisatud</Text> : null}</View></Pressable>)}
      </ScrollView>}
    </View>
    <View style={styles.tabs}><Pressable accessibilityRole="tab" accessibilityState={{ selected: screen === 'form' }} onPress={() => router.replace('/')} style={[styles.tab, screen === 'form' && styles.activeTab]}><Text style={[styles.tabText, screen === 'form' && styles.activeTabText]}>＋  Uus taotlus</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: screen === 'tickets' }} onPress={() => router.replace('/tickets')} style={[styles.tab, screen === 'tickets' && styles.activeTab]}><Text style={[styles.tabText, screen === 'tickets' && styles.activeTabText]}>▤  Taotlused ({tickets.length})</Text></Pressable></View>
    <Modal transparent visible={picker !== null} animationType="fade" onRequestClose={() => setPicker(null)}><Pressable style={styles.overlay} onPress={() => setPicker(null)}><View style={styles.sheet}><Text style={styles.sheetTitle}>{picker === 'department' ? 'Osakond' : picker === 'process' ? 'Protsess' : picker === 'category' ? 'Teate kategooria' : 'Prioriteet'}</Text>{options.map(option => <Pressable key={option} onPress={() => choose(option)} style={styles.option}><Text style={styles.optionText}>{option}</Text><Text style={styles.optionCheck}>{picker && form[picker] === option ? '✓' : ''}</Text></Pressable>)}<Pressable onPress={() => setPicker(null)} style={styles.cancel}><Text style={styles.cancelText}>Sulge</Text></Pressable></View></Pressable></Modal>
    <Modal transparent visible={selected !== null} animationType="slide" onRequestClose={() => setSelected(null)}><View style={styles.detailOverlay}><ScrollView style={styles.detailSheet} contentContainerStyle={styles.detailContent}><Pressable onPress={() => setSelected(null)} style={styles.close}><Text style={styles.closeText}>Sulge ×</Text></Pressable>{selected ? <><Text style={styles.detailEyebrow}>{dateTime(selected.createdAt)} · {selected.status}</Text><Text style={styles.detailTitle}>{selected.title}</Text><Text style={styles.detailBody}>{selected.description}</Text>{selected.photo ? <Image source={{ uri: selected.photo }} style={styles.detailPhoto} resizeMode="contain"/> : null}{[['Osakond', selected.department], ['Protsess', selected.process], ['Nimi', selected.name], ['Teate kategooria', selected.category], ['Prioriteet', selected.priority]].map(([label, value]) => <View key={label} style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>)}</> : null}</ScrollView></View></Modal>
  </SafeAreaView>;
}

const colors = { navy: '#152B43', blue: '#176DB5', ink: '#16283B', muted: '#65788B', border: '#DCE5ED', bg: '#F3F6F9' };
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy }, flex: { flex: 1 }, body: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 72, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.navy }, mark: { width: 36, height: 36, borderRadius: 9, backgroundColor: '#2E638E', alignItems: 'center', justifyContent: 'center' }, markText: { color: 'white', fontWeight: '900', fontSize: 19 }, headerTitle: { color: 'white', fontSize: 20, fontWeight: '800' }, headerSub: { color: '#ACC6DA', fontSize: 12, marginTop: 1 }, local: { marginLeft: 'auto', borderWidth: 1, borderColor: '#52738F', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4 }, localText: { color: '#BDD1E1', fontSize: 10, letterSpacing: 0.8, fontWeight: '800' },
  scroll: { padding: 18, paddingBottom: 34 }, heading: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8, color: colors.ink, marginTop: 8 }, intro: { fontSize: 14, color: colors.muted, marginTop: 5, marginBottom: 20 }, card: { backgroundColor: 'white', padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 14 }, section: { color: colors.blue, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 18 }, field: { marginBottom: 18 }, label: { fontSize: 14, color: '#344C62', fontWeight: '700', marginBottom: 8 }, required: { color: '#D25446' }, optional: { fontWeight: '400', color: colors.muted }, select: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF' }, value: { fontSize: 16, color: colors.ink, flex: 1 }, placeholder: { color: '#92A1AF' }, chevron: { color: colors.muted, fontSize: 22, paddingLeft: 10, paddingBottom: 7 }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, minHeight: 50, paddingHorizontal: 14, fontSize: 16, color: colors.ink, backgroundColor: 'white' }, textarea: { minHeight: 126, paddingTop: 13, paddingBottom: 13, lineHeight: 22 }, rule: { height: 1, backgroundColor: '#E9EEF2', marginTop: 2, marginBottom: 22 }, photoActions: { flexDirection: 'row', gap: 10 }, photoButton: { flex: 1, paddingVertical: 14, borderColor: '#B5D4E9', backgroundColor: '#F3F9FD', borderWidth: 1, borderRadius: 9, alignItems: 'center' }, photoButtonText: { color: '#186499', fontSize: 14, fontWeight: '700' }, photoWrap: { marginBottom: 12 }, photo: { height: 166, borderRadius: 9, backgroundColor: colors.bg }, remove: { position: 'absolute', right: 9, top: 9, backgroundColor: '#FFFFFFEE', padding: 8, borderRadius: 6 }, removeText: { color: '#A83E39', fontSize: 12, fontWeight: '700' }, error: { marginTop: 16, color: '#A92F2A', fontSize: 14, fontWeight: '600' }, save: { marginTop: 18, minHeight: 54, borderRadius: 10, backgroundColor: colors.blue, justifyContent: 'center', alignItems: 'center' }, disabled: { opacity: 0.55 }, saveText: { color: 'white', fontWeight: '800', fontSize: 16 }, caption: { textAlign: 'center', color: colors.muted, lineHeight: 18, fontSize: 12, marginTop: 14, paddingHorizontal: 8 },
  tabs: { flexDirection: 'row', padding: 8, paddingBottom: Platform.OS === 'ios' ? 20 : 9, gap: 8, backgroundColor: 'white', borderTopWidth: 1, borderColor: colors.border }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8 }, activeTab: { backgroundColor: '#EAF3FA' }, tabText: { color: colors.muted, fontSize: 14, fontWeight: '700' }, activeTabText: { color: colors.blue }, empty: { backgroundColor: 'white', padding: 30, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border }, emptyIcon: { fontSize: 35, color: '#8AAAC2' }, emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 12 }, emptyText: { color: colors.muted, fontSize: 14, marginTop: 5 }, emptyButton: { marginTop: 22, backgroundColor: colors.blue, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 18 }, emptyButtonText: { color: 'white', fontWeight: '700' },
  ticket: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, padding: 18, borderRadius: 12, marginBottom: 12 }, ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, ticketTime: { color: colors.muted, fontSize: 12 }, ticketStatus: { color: '#1767A8', backgroundColor: '#E6F2FA', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, fontSize: 12, fontWeight: '700' }, ticketTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 11 }, ticketMeta: { color: colors.blue, fontSize: 14, fontWeight: '700', marginTop: 6 }, ticketDescription: { color: '#52677A', fontSize: 14, lineHeight: 20, marginTop: 9 }, ticketFoot: { flexDirection: 'row', gap: 12, marginTop: 14 }, ticketPriority: { color: '#6B7D8D', fontSize: 12, fontWeight: '700' }, ticketPhoto: { color: colors.blue, fontSize: 12, fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#081C30A8' }, sheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28 }, sheetTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', marginBottom: 12 }, option: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#EBEFF2' }, optionText: { flex: 1, color: colors.ink, fontSize: 16 }, optionCheck: { color: colors.blue, fontSize: 20, fontWeight: '700' }, cancel: { alignItems: 'center', marginTop: 15, padding: 12 }, cancelText: { color: colors.blue, fontSize: 15, fontWeight: '700' },
  detailOverlay: { flex: 1, backgroundColor: '#081C30A8', paddingTop: 70 }, detailSheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20 }, detailContent: { padding: 24, paddingBottom: 42 }, close: { alignSelf: 'flex-end', padding: 5, marginBottom: 20 }, closeText: { color: colors.blue, fontWeight: '700', fontSize: 15 }, detailEyebrow: { color: colors.muted, fontSize: 13 }, detailTitle: { color: colors.ink, fontSize: 26, fontWeight: '800', marginTop: 10 }, detailBody: { color: '#344B60', fontSize: 16, lineHeight: 24, marginTop: 18, marginBottom: 20 }, detailPhoto: { height: 240, width: '100%', backgroundColor: colors.bg, borderRadius: 9, marginBottom: 16 }, detailRow: { paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 15 }, detailLabel: { width: 112, color: colors.muted, fontSize: 14 }, detailValue: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'right' },
});
