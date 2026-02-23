const UZ_LOCATIONS = Object.freeze({
    regions: [
        {
            code: 'karakalpakstan',
            name_ru: 'Республика Каракалпакстан',
            name_uz: "Qoraqalpog'iston Respublikasi",
            cities: [
                { code: 'nukus_city', name_ru: 'Нукус', name_uz: 'Nukus shahri' },
                { code: 'amudarya', name_ru: 'Амударьинский район', name_uz: 'Amudaryo tumani' },
                { code: 'beruniy', name_ru: 'Берунийский район', name_uz: 'Beruniy tumani' },
                { code: 'bozatov', name_ru: 'Бозатауский район', name_uz: 'Bozatov tumani' },
                { code: 'chimboy', name_ru: 'Чимбайский район', name_uz: 'Chimboy tumani' },
                { code: 'ellikqala', name_ru: 'Элликкалинский район', name_uz: "Ellikqal'a tumani" },
                { code: 'kegeyli', name_ru: 'Кегейлийский район', name_uz: 'Kegeyli tumani' },
                { code: 'moynaq', name_ru: 'Муйнакский район', name_uz: "Mo'ynoq tumani" },
                { code: 'nukus_district', name_ru: 'Нукусский район', name_uz: 'Nukus tumani' },
                { code: 'qanlikol', name_ru: 'Канлыкульский район', name_uz: "Qanliko'l tumani" },
                { code: 'qonirat', name_ru: 'Кунградский район', name_uz: "Qo'ng'irot tumani" },
                { code: 'shumanay', name_ru: 'Шуманайский район', name_uz: 'Shumanay tumani' },
                { code: 'taxtakopir', name_ru: 'Тахтакупырский район', name_uz: "Taxtako'pir tumani" },
                { code: 'tortkol', name_ru: 'Турткульский район', name_uz: "To'rtko'l tumani" },
                { code: 'xojayli', name_ru: 'Ходжейлийский район', name_uz: "Xo'jayli tumani" }
            ]
        },
        {
            code: 'andijan',
            name_ru: 'Андижанская область',
            name_uz: 'Andijon viloyati',
            cities: [
                { code: 'andijan_city', name_ru: 'Андижан', name_uz: 'Andijon shahri' },
                { code: 'asaka_city', name_ru: 'Асака', name_uz: 'Asaka shahri' },
                { code: 'xonobod_city', name_ru: 'Ханабад', name_uz: 'Xonobod shahri' },
                { code: 'andijan_district', name_ru: 'Андижанский район', name_uz: 'Andijon tumani' },
                { code: 'asaka_district', name_ru: 'Асакинский район', name_uz: 'Asaka tumani' },
                { code: 'baliqchi', name_ru: 'Балыкчинский район', name_uz: 'Baliqchi tumani' },
                { code: 'boz', name_ru: 'Бозский район', name_uz: "Bo'z tumani" },
                { code: 'buloqboshi', name_ru: 'Булакбашинский район', name_uz: 'Buloqboshi tumani' },
                { code: 'izboskan', name_ru: 'Избасканский район', name_uz: 'Izboskan tumani' },
                { code: 'jalolquduq', name_ru: 'Джалалкудукский район', name_uz: 'Jalolquduq tumani' },
                { code: 'marhamat', name_ru: 'Мархаматский район', name_uz: 'Marhamat tumani' },
                { code: 'oltinkol', name_ru: 'Алтынкульский район', name_uz: "Oltinko'l tumani" },
                { code: 'paxtaobod', name_ru: 'Пахтаабадский район', name_uz: 'Paxtaobod tumani' },
                { code: 'qorgontepa', name_ru: 'Кургантепинский район', name_uz: "Qo'rg'ontepa tumani" },
                { code: 'shahrixon', name_ru: 'Шахриханский район', name_uz: 'Shahrixon tumani' },
                { code: 'ulugnor', name_ru: 'Улугнорский район', name_uz: "Ulug'nor tumani" },
                { code: 'xojaobod', name_ru: 'Ходжаабадский район', name_uz: "Xo'jaobod tumani" }
            ]
        },
        {
            code: 'bukhara',
            name_ru: 'Бухарская область',
            name_uz: 'Buxoro viloyati',
            cities: [
                { code: 'bukhara_city', name_ru: 'Бухара', name_uz: 'Buxoro shahri' },
                { code: 'kogon_city', name_ru: 'Каган', name_uz: 'Kogon shahri' },
                { code: 'bukhara_district', name_ru: 'Бухарский район', name_uz: 'Buxoro tumani' },
                { code: 'gijduvon', name_ru: 'Гиждуванский район', name_uz: "G'ijduvon tumani" },
                { code: 'jondor', name_ru: 'Жондорский район', name_uz: 'Jondor tumani' },
                { code: 'kogon_district', name_ru: 'Каганский район', name_uz: 'Kogon tumani' },
                { code: 'olot', name_ru: 'Алатский район', name_uz: 'Olot tumani' },
                { code: 'peshku', name_ru: 'Пешкунский район', name_uz: 'Peshku tumani' },
                { code: 'qorakol', name_ru: 'Каракульский район', name_uz: "Qorako'l tumani" },
                { code: 'qorovulbozor', name_ru: 'Караулбазарский район', name_uz: 'Qorovulbozor tumani' },
                { code: 'romitan', name_ru: 'Ромитанский район', name_uz: 'Romitan tumani' },
                { code: 'shofirkon', name_ru: 'Шафирканский район', name_uz: 'Shofirkon tumani' },
                { code: 'vobkent', name_ru: 'Вабкентский район', name_uz: 'Vobkent tumani' }
            ]
        },
        {
            code: 'fergana',
            name_ru: 'Ферганская область',
            name_uz: "Farg'ona viloyati",
            cities: [
                { code: 'fergana_city', name_ru: 'Фергана', name_uz: "Farg'ona shahri" },
                { code: 'margilon_city', name_ru: 'Маргилан', name_uz: "Marg'ilon shahri" },
                { code: 'quvasoy_city', name_ru: 'Кувасай', name_uz: 'Quvasoy shahri' },
                { code: 'fergana_district', name_ru: 'Ферганский район', name_uz: "Farg'ona tumani" },
                { code: 'oltiariq', name_ru: 'Алтыарыкский район', name_uz: "Oltiariq tumani" },
                { code: 'bagdod', name_ru: 'Багдадский район', name_uz: "Bag'dod tumani" },
                { code: 'beshariq', name_ru: 'Бешарыкский район', name_uz: 'Beshariq tumani' },
                { code: 'buvayda', name_ru: 'Бувайдинский район', name_uz: 'Buvayda tumani' },
                { code: 'dangara', name_ru: 'Дангаринский район', name_uz: "Dang'ara tumani" },
                { code: 'furqat', name_ru: 'Фуркатский район', name_uz: 'Furqat tumani' },
                { code: 'qoshtepa', name_ru: 'Куштепинский район', name_uz: "Qo'shtepa tumani" },
                { code: 'quva', name_ru: 'Кувинский район', name_uz: 'Quva tumani' },
                { code: 'rishton', name_ru: 'Риштанский район', name_uz: 'Rishton tumani' },
                { code: 'sox', name_ru: 'Сохский район', name_uz: "So'x tumani" },
                { code: 'toshloq', name_ru: 'Ташлакский район', name_uz: 'Toshloq tumani' },
                { code: 'uchkoprik', name_ru: 'Учкуприкский район', name_uz: "Uchko'prik tumani" },
                { code: 'yozyovon', name_ru: 'Язъяванский район', name_uz: 'Yozyovon tumani' }
            ]
        },
        {
            code: 'jizzakh',
            name_ru: 'Джизакская область',
            name_uz: 'Jizzax viloyati',
            cities: [
                { code: 'jizzakh_city', name_ru: 'Джизак', name_uz: 'Jizzax shahri' },
                { code: 'arnasoy', name_ru: 'Арнасайский район', name_uz: 'Arnasoy tumani' },
                { code: 'baxmal', name_ru: 'Бахмальский район', name_uz: 'Baxmal tumani' },
                { code: 'dostlik', name_ru: 'Дустликский район', name_uz: "Do'stlik tumani" },
                { code: 'forish', name_ru: 'Форишский район', name_uz: 'Forish tumani' },
                { code: 'gallaorol', name_ru: 'Галлааральский район', name_uz: "G'allaorol tumani" },
                { code: 'mirzachol', name_ru: 'Мирзачульский район', name_uz: "Mirzacho'l tumani" },
                { code: 'paxtakor', name_ru: 'Пахтакорский район', name_uz: 'Paxtakor tumani' },
                { code: 'yangiobod', name_ru: 'Янгиабадский район', name_uz: 'Yangiobod tumani' },
                { code: 'zafarobod', name_ru: 'Зафарабадский район', name_uz: 'Zafarobod tumani' },
                { code: 'zarbdor', name_ru: 'Зарбдорский район', name_uz: 'Zarbdor tumani' },
                { code: 'zomin', name_ru: 'Зааминский район', name_uz: 'Zomin tumani' },
                { code: 'sharof_rashidov', name_ru: 'Шараф-Рашидовский район', name_uz: 'Sharof Rashidov tumani' }
            ]
        },
        {
            code: 'khorezm',
            name_ru: 'Хорезмская область',
            name_uz: 'Xorazm viloyati',
            cities: [
                { code: 'urgench_city', name_ru: 'Ургенч', name_uz: 'Urganch shahri' },
                { code: 'xiva_city', name_ru: 'Хива', name_uz: 'Xiva shahri' },
                { code: 'bogot', name_ru: 'Багатский район', name_uz: "Bog'ot tumani" },
                { code: 'gurlan', name_ru: 'Гурленский район', name_uz: 'Gurlan tumani' },
                { code: 'hazorasp', name_ru: 'Хазараспский район', name_uz: 'Hazorasp tumani' },
                { code: 'xiva_district', name_ru: 'Хивинский район', name_uz: 'Xiva tumani' },
                { code: 'qoshkopir', name_ru: 'Кошкупырский район', name_uz: "Qo'shko'pir tumani" },
                { code: 'shovot', name_ru: 'Шаватский район', name_uz: 'Shovot tumani' },
                { code: 'tuproqqala', name_ru: 'Тупроккалинский район', name_uz: "Tuproqqal'a tumani" },
                { code: 'urgench_district', name_ru: 'Ургенчский район', name_uz: 'Urganch tumani' },
                { code: 'xonqa', name_ru: 'Ханкинский район', name_uz: "Xonqa tumani" },
                { code: 'yangiariq', name_ru: 'Янгиарыкский район', name_uz: 'Yangiariq tumani' },
                { code: 'yangibozor', name_ru: 'Янгибазарский район', name_uz: 'Yangibozor tumani' }
            ]
        },
        {
            code: 'namangan',
            name_ru: 'Наманганская область',
            name_uz: 'Namangan viloyati',
            cities: [
                { code: 'namangan_city', name_ru: 'Наманган', name_uz: 'Namangan shahri' },
                { code: 'chortoq', name_ru: 'Чартакский район', name_uz: 'Chortoq tumani' },
                { code: 'chust', name_ru: 'Чустский район', name_uz: 'Chust tumani' },
                { code: 'kosonsoy', name_ru: 'Касансайский район', name_uz: 'Kosonsoy tumani' },
                { code: 'mingbuloq', name_ru: 'Мингбулакский район', name_uz: 'Mingbuloq tumani' },
                { code: 'namangan_district', name_ru: 'Наманганский район', name_uz: 'Namangan tumani' },
                { code: 'norin', name_ru: 'Нарынский район', name_uz: 'Norin tumani' },
                { code: 'pop', name_ru: 'Папский район', name_uz: 'Pop tumani' },
                { code: 'toraqorgon', name_ru: 'Туракурганский район', name_uz: "To'raqo'rg'on tumani" },
                { code: 'uchqorgon', name_ru: 'Учкурганский район', name_uz: "Uchqo'rg'on tumani" },
                { code: 'uychi', name_ru: 'Уйчинский район', name_uz: 'Uychi tumani' },
                { code: 'yangiqorgon', name_ru: 'Янгикурганский район', name_uz: "Yangiqo'rg'on tumani" }
            ]
        },
        {
            code: 'navoi',
            name_ru: 'Навоийская область',
            name_uz: 'Navoiy viloyati',
            cities: [
                { code: 'navoi_city', name_ru: 'Навои', name_uz: 'Navoiy shahri' },
                { code: 'zarafshon_city', name_ru: 'Зарафшан', name_uz: 'Zarafshon shahri' },
                { code: 'karmana', name_ru: 'Карманинский район', name_uz: 'Karmana tumani' },
                { code: 'konimex', name_ru: 'Канимехский район', name_uz: 'Konimex tumani' },
                { code: 'navbahor', name_ru: 'Навбахорский район', name_uz: 'Navbahor tumani' },
                { code: 'nurota', name_ru: 'Нуратаинский район', name_uz: 'Nurota tumani' },
                { code: 'qiziltepa', name_ru: 'Кызылтепинский район', name_uz: 'Qiziltepa tumani' },
                { code: 'tomdi', name_ru: 'Тамдынский район', name_uz: 'Tomdi tumani' },
                { code: 'uchquduq', name_ru: 'Учкудукский район', name_uz: 'Uchquduq tumani' },
                { code: 'xatirchi', name_ru: 'Хатырчинский район', name_uz: 'Xatirchi tumani' }
            ]
        },
        {
            code: 'kashkadarya',
            name_ru: 'Кашкадарьинская область',
            name_uz: 'Qashqadaryo viloyati',
            cities: [
                { code: 'qarshi_city', name_ru: 'Карши', name_uz: 'Qarshi shahri' },
                { code: 'shahrisabz_city', name_ru: 'Шахрисабз', name_uz: 'Shahrisabz shahri' },
                { code: 'chiroqchi', name_ru: 'Чиракчинский район', name_uz: 'Chiroqchi tumani' },
                { code: 'dehqonobod', name_ru: 'Дехканабадский район', name_uz: 'Dehqonobod tumani' },
                { code: 'guzor', name_ru: 'Гузарский район', name_uz: "G'uzor tumani" },
                { code: 'kasbi', name_ru: 'Касбинский район', name_uz: 'Kasbi tumani' },
                { code: 'kitob', name_ru: 'Китабский район', name_uz: 'Kitob tumani' },
                { code: 'koson', name_ru: 'Касанский район', name_uz: 'Koson tumani' },
                { code: 'mirishkor', name_ru: 'Миришкорский район', name_uz: 'Mirishkor tumani' },
                { code: 'muborak', name_ru: 'Мубарекский район', name_uz: 'Muborak tumani' },
                { code: 'nishon', name_ru: 'Нишанский район', name_uz: 'Nishon tumani' },
                { code: 'qamashi', name_ru: 'Камашинский район', name_uz: 'Qamashi tumani' },
                { code: 'qarshi_district', name_ru: 'Каршинский район', name_uz: 'Qarshi tumani' },
                { code: 'shahrisabz_district', name_ru: 'Шахрисабзский район', name_uz: 'Shahrisabz tumani' },
                { code: 'yakkabog', name_ru: 'Яккабагский район', name_uz: "Yakkabog' tumani" }
            ]
        },
        {
            code: 'samarkand',
            name_ru: 'Самаркандская область',
            name_uz: 'Samarqand viloyati',
            cities: [
                { code: 'samarkand_city', name_ru: 'Самарканд', name_uz: 'Samarqand shahri' },
                { code: 'kattaqorgon_city', name_ru: 'Каттакурган', name_uz: "Kattaqo'rg'on shahri" },
                { code: 'bulungur', name_ru: 'Булунгурский район', name_uz: "Bulung'ur tumani" },
                { code: 'ishtixon', name_ru: 'Иштыханский район', name_uz: 'Ishtixon tumani' },
                { code: 'jomboy', name_ru: 'Джамбайский район', name_uz: 'Jomboy tumani' },
                { code: 'kattaqorgon_district', name_ru: 'Каттакурганский район', name_uz: "Kattaqo'rg'on tumani" },
                { code: 'narpay', name_ru: 'Нарпайский район', name_uz: 'Narpay tumani' },
                { code: 'nurobod', name_ru: 'Нурабадский район', name_uz: 'Nurobod tumani' },
                { code: 'oqdaryo', name_ru: 'Акдарьинский район', name_uz: 'Oqdaryo tumani' },
                { code: 'paxtachi', name_ru: 'Пахтачинский район', name_uz: 'Paxtachi tumani' },
                { code: 'payariq', name_ru: 'Пайарыкский район', name_uz: 'Payariq tumani' },
                { code: 'pastdargom', name_ru: 'Пастдаргомский район', name_uz: "Pastdarg'om tumani" },
                { code: 'qoshrabot', name_ru: 'Кошрабадский район', name_uz: "Qo'shrabot tumani" },
                { code: 'samarkand_district', name_ru: 'Самаркандский район', name_uz: 'Samarqand tumani' },
                { code: 'toyloq', name_ru: 'Тайлякский район', name_uz: "Toyloq tumani" },
                { code: 'urgut', name_ru: 'Ургутский район', name_uz: 'Urgut tumani' }
            ]
        },
        {
            code: 'sirdarya',
            name_ru: 'Сырдарьинская область',
            name_uz: 'Sirdaryo viloyati',
            cities: [
                { code: 'guliston_city', name_ru: 'Гулистан', name_uz: 'Guliston shahri' },
                { code: 'shirin_city', name_ru: 'Ширин', name_uz: 'Shirin shahri' },
                { code: 'yangiyer_city', name_ru: 'Янгиер', name_uz: 'Yangiyer shahri' },
                { code: 'boyovut', name_ru: 'Баяутский район', name_uz: 'Boyovut tumani' },
                { code: 'guliston_district', name_ru: 'Гулистанский район', name_uz: 'Guliston tumani' },
                { code: 'mirzaobod', name_ru: 'Мирзаабадский район', name_uz: 'Mirzaobod tumani' },
                { code: 'oqoltin', name_ru: 'Акалтынский район', name_uz: 'Oqoltin tumani' },
                { code: 'sardoba', name_ru: 'Сардобинский район', name_uz: 'Sardoba tumani' },
                { code: 'sayxunobod', name_ru: 'Сайхунабадский район', name_uz: 'Sayxunobod tumani' },
                { code: 'sirdaryo_district', name_ru: 'Сырдарьинский район', name_uz: 'Sirdaryo tumani' },
                { code: 'xovos', name_ru: 'Хавастский район', name_uz: 'Xovos tumani' }
            ]
        },
        {
            code: 'surkhandarya',
            name_ru: 'Сурхандарьинская область',
            name_uz: 'Surxondaryo viloyati',
            cities: [
                { code: 'termiz_city', name_ru: 'Термез', name_uz: 'Termiz shahri' },
                { code: 'angor', name_ru: 'Ангорский район', name_uz: 'Angor tumani' },
                { code: 'bandixon', name_ru: 'Бандиханский район', name_uz: 'Bandixon tumani' },
                { code: 'boysun', name_ru: 'Байсунский район', name_uz: 'Boysun tumani' },
                { code: 'denov', name_ru: 'Денауский район', name_uz: 'Denov tumani' },
                { code: 'jarqorgon', name_ru: 'Джаркурганский район', name_uz: "Jarqo'rg'on tumani" },
                { code: 'muzrabot', name_ru: 'Музрабадский район', name_uz: 'Muzrabot tumani' },
                { code: 'oltinsoy', name_ru: 'Алтынсайский район', name_uz: 'Oltinsoy tumani' },
                { code: 'qiziriq', name_ru: 'Кизирикский район', name_uz: 'Qiziriq tumani' },
                { code: 'qumqorgon', name_ru: 'Кумкурганский район', name_uz: "Qumqo'rg'on tumani" },
                { code: 'sariosiyo', name_ru: 'Сариасийский район', name_uz: 'Sariosiyo tumani' },
                { code: 'sherobod', name_ru: 'Шерабадский район', name_uz: 'Sherobod tumani' },
                { code: 'shorchi', name_ru: 'Шурчинский район', name_uz: "Sho'rchi tumani" },
                { code: 'termiz_district', name_ru: 'Термезский район', name_uz: 'Termiz tumani' },
                { code: 'uzun', name_ru: 'Узунский район', name_uz: 'Uzun tumani' }
            ]
        },
        {
            code: 'tashkent_region',
            name_ru: 'Ташкентская область',
            name_uz: 'Toshkent viloyati',
            cities: [
                { code: 'nurafshon_city', name_ru: 'Нурафшон', name_uz: 'Nurafshon shahri' },
                { code: 'angren_city', name_ru: 'Ангрен', name_uz: 'Angren shahri' },
                { code: 'bekobod_city', name_ru: 'Бекабад', name_uz: 'Bekobod shahri' },
                { code: 'ohangaron_city', name_ru: 'Ахангаран', name_uz: 'Ohangaron shahri' },
                { code: 'yangiyol_city', name_ru: 'Янгиюль', name_uz: "Yangiyo'l shahri" },
                { code: 'bekobod_district', name_ru: 'Бекабадский район', name_uz: 'Bekobod tumani' },
                { code: 'boka', name_ru: 'Букинский район', name_uz: "Bo'ka tumani" },
                { code: 'bostonliq', name_ru: 'Бостанлыкский район', name_uz: "Bo'stonliq tumani" },
                { code: 'chinoz', name_ru: 'Чиназский район', name_uz: 'Chinoz tumani' },
                { code: 'ohangaron_district', name_ru: 'Ахангаранский район', name_uz: 'Ohangaron tumani' },
                { code: 'oqqorgon', name_ru: 'Аккурганский район', name_uz: "Oqqo'rg'on tumani" },
                { code: 'parkent', name_ru: 'Паркентский район', name_uz: 'Parkent tumani' },
                { code: 'piskent', name_ru: 'Пскентский район', name_uz: 'Piskent tumani' },
                { code: 'quyi_chirchiq', name_ru: 'Куйичирчикский район', name_uz: 'Quyi Chirchiq tumani' },
                { code: 'tashkent_district', name_ru: 'Ташкентский район', name_uz: 'Toshkent tumani' },
                { code: 'orta_chirchiq', name_ru: 'Уртачирчикский район', name_uz: "O'rta Chirchiq tumani" },
                { code: 'yangiyol_district', name_ru: 'Янгиюльский район', name_uz: "Yangiyo'l tumani" },
                { code: 'yuqori_chirchiq', name_ru: 'Юкоричирчикский район', name_uz: 'Yuqori Chirchiq tumani' },
                { code: 'zangiota', name_ru: 'Зангиатинский район', name_uz: 'Zangiota tumani' }
            ]
        },
        {
            code: 'tashkent_city',
            name_ru: 'г. Ташкент',
            name_uz: 'Toshkent shahri',
            cities: [
                { code: 'bektemir', name_ru: 'Бектемирский район', name_uz: 'Bektemir tumani' },
                { code: 'chilonzor', name_ru: 'Чиланзарский район', name_uz: 'Chilonzor tumani' },
                { code: 'mirobod', name_ru: 'Мирабадский район', name_uz: 'Mirobod tumani' },
                { code: 'mirzo_ulugbek', name_ru: 'Мирзо-Улугбекский район', name_uz: 'Mirzo Ulugbek tumani' },
                { code: 'olmazor', name_ru: 'Алмазарский район', name_uz: 'Olmazor tumani' },
                { code: 'sergeli', name_ru: 'Сергелийский район', name_uz: 'Sergeli tumani' },
                { code: 'shayxontohur', name_ru: 'Шайхантахурский район', name_uz: 'Shayxontohur tumani' },
                { code: 'uchtepa', name_ru: 'Учтепинский район', name_uz: 'Uchtepa tumani' },
                { code: 'yakkasaroy', name_ru: 'Яккасарайский район', name_uz: 'Yakkasaroy tumani' },
                { code: 'yashnobod', name_ru: 'Яшнабадский район', name_uz: 'Yashnobod tumani' },
                { code: 'yunusobod', name_ru: 'Юнусабадский район', name_uz: 'Yunusobod tumani' },
                { code: 'yangihayot', name_ru: 'Янги-Хаётский район', name_uz: 'Yangi Hayot tumani' }
            ]
        }
    ]
});

module.exports = {
    UZ_LOCATIONS
};
