<?php /* Smarty version 2.6.18, created on 2025-11-24 17:35:32
         compiled from C:%5Cxampp%5Chtdocs%5Crevive/lib/templates/admin/form/custom-campaign-remaining-click.html */ ?>
<?php require_once(SMARTY_CORE_DIR . 'core.load_plugins.php');
smarty_core_load_plugins(array('plugins' => array(array('function', 't', 'C:\\xampp\\htdocs\\revive/lib/templates/admin/form/custom-campaign-remaining-click.html', 15, false),)), $this); ?>

<span id="remainingClicksSection">
     <span id='clicks_remaining_span' class="hide"><?php echo $this->_plugins['function']['t'][0](['str' => 'ClicksRemaining'], $this);?>
:<span id='clicks_remaining_count'><?php echo $this->_tpl_vars['_e']['vars']['clicksRemaining']; ?>
</span></span><br/>
<?php if ($this->_tpl_vars['adDirectEnabled']): ?>
     <span id="openadsRemainingClicks"><?php echo $this->_plugins['function']['t'][0](['str' => 'OpenxClicksRemaining'], $this);?>
: <span id='openadsRemainingClicksCount'>600 *REAL DATA GOES HERE*</span>
       <span class="link hide" help="help-openads-remaining-clicks" id="openadsRemainingClicksHelpLink"><img style="border: none; position: relative; top:5px;" src="<?php echo $this->_tpl_vars['assetPath']; ?>
/images/help-book.gif" /></span>
     </span>
    <div class="hide" id="help-openads-remaining-clicks" style="height: auto; width: 290px;">
     <?php echo $this->_plugins['function']['t'][0](['str' => 'OpenxClicksRemainingHelp'], $this);?>

    </div>
<?php endif; ?>
</span>